import { useRef, useState } from 'react';
import { RiAddLine, RiUploadLine } from 'react-icons/ri';
import { Button } from '@/components/primitives/button';
import { Separator } from '@/components/primitives/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { showErrorToast, showSuccessToast, showWarningToast } from '@/components/primitives/sonner-helpers';
import { Checkbox } from '@/components/primitives/checkbox';
import { BackupList } from './backup-list';
import { WorkflowExportForm } from './workflow-export-form';
import { WorkflowImportForm } from './workflow-import-form';
import { useFetchBackups } from '@/hooks/use-fetch-backups';
import { useCreateBackup } from '@/hooks/use-create-backup';
import { useRestoreBackup, type RestoreResult } from '@/hooks/use-restore-backup';

export function DataManagementSettings() {
  const { data: backupsData, isLoading: isLoadingBackups } = useFetchBackups();
  const createBackupMutation = useCreateBackup();
  const restoreMutation = useRestoreBackup();

  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  const handleCreateBackup = async () => {
    try {
      const result = await createBackupMutation.mutateAsync();
      showSuccessToast(
        `Backup created: ${result.backup.filename} (${result.backup.totalDocuments} documents)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backup creation failed';
      showErrorToast(message, 'Backup Error');
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setRestoreFile(file);
    setRestoreResult(null);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreFile) return;

    try {
      const result = await restoreMutation.mutateAsync({
        file: restoreFile,
        dryRun,
      });

      setRestoreResult(result);
      if (result.dryRun) {
        showWarningToast(
          `Dry run: would restore ${result.restored.totalDocuments} documents across ${result.restored.collections} collections`,
          'Dry Run Complete'
        );
      } else {
        showSuccessToast(
          `Restored ${result.restored.totalDocuments} documents across ${result.restored.collections} collections`
        );
        // Reset file input after successful restore
        setRestoreFile(null);
        if (restoreFileInputRef.current) {
          restoreFileInputRef.current.value = '';
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed';
      showErrorToast(message, 'Restore Error');
    } finally {
      setRestoreConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ========== Backup & Restore Section ========== */}
      <section>
        <h2 className="text-label-sm text-text-strong mb-1">Backup & Restore</h2>
        <p className="text-sm text-foreground-600 mb-4">
          Create full database backups or restore from a previous backup file.
        </p>

        {/* Create backup */}
        <div className="mb-4">
          <Button
            variant="primary"
            mode="filled"
            size="sm"
            isLoading={createBackupMutation.isPending}
            onClick={handleCreateBackup}
            leadingIcon={RiAddLine}
          >
            Create Backup
          </Button>
        </div>

        {/* Backup list */}
        <BackupList backups={backupsData?.backups || []} isLoading={isLoadingBackups} />

        <Separator variant="line-spacing" className="my-6" />

        {/* Restore */}
        <div className="space-y-3">
          <h3 className="text-label-sm text-text-strong">Restore from Backup</h3>
          <p className="text-sm text-foreground-600">
            Upload a <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">.tar.gz</code> backup file to restore
            the database. An automatic backup of the current state will be created before restoring.
          </p>

          <div className="space-y-3">
            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".tar.gz,.tgz"
              onChange={handleRestoreFileChange}
              className="text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-200"
            />

            <div className="flex items-center gap-2">
              <Checkbox
                id="dry-run"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked === true)}
              />
              <label htmlFor="dry-run" className="text-sm text-foreground-600 cursor-pointer">
                Dry run (preview what would be restored without making changes)
              </label>
            </div>

            <Button
              variant="secondary"
              mode="outline"
              size="sm"
              disabled={!restoreFile}
              isLoading={restoreMutation.isPending}
              onClick={() => {
                if (dryRun) {
                  handleRestoreConfirm();
                } else {
                  setRestoreConfirmOpen(true);
                }
              }}
              leadingIcon={RiUploadLine}
            >
              {dryRun ? 'Preview Restore' : 'Restore'}
            </Button>
          </div>

          {/* Restore results */}
          {restoreResult && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2">
              <h4 className="text-label-sm text-text-strong">
                {restoreResult.dryRun ? 'Dry Run Results' : 'Restore Results'}
              </h4>
              <p className="text-sm text-foreground-600">{restoreResult.message}</p>
              <div className="text-sm">
                <span className="text-foreground-400">Collections:</span>{' '}
                <strong>{restoreResult.restored.collections}</strong>
              </div>
              <div className="text-sm">
                <span className="text-foreground-400">Total documents:</span>{' '}
                <strong>{restoreResult.restored.totalDocuments}</strong>
              </div>
              {restoreResult.restored.details && restoreResult.restored.details.length > 0 && (
                <div className="mt-2 space-y-1">
                  {restoreResult.restored.details.map((d) => (
                    <div key={d.collection} className="text-xs text-foreground-400">
                      {d.collection}: {d.documents} documents
                    </div>
                  ))}
                </div>
              )}
              {restoreResult.autoBackup && (
                <div className="text-sm text-foreground-600 mt-2">
                  Auto-backup created: <code className="text-xs">{restoreResult.autoBackup.filename}</code>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Separator variant="line" />

      {/* ========== Import & Export Section ========== */}
      <section>
        <h2 className="text-label-sm text-text-strong mb-1">Import & Export Workflows</h2>
        <p className="text-sm text-foreground-600 mb-4">
          Export workflows from the current environment or import workflows from a JSON export file.
        </p>

        {/* Export */}
        <div className="mb-4">
          <h3 className="text-label-sm text-text-strong mb-2">Export</h3>
          <WorkflowExportForm />
        </div>

        <Separator variant="line-spacing" className="my-6" />

        {/* Import */}
        <div>
          <h3 className="text-label-sm text-text-strong mb-2">Import</h3>
          <WorkflowImportForm />
        </div>
      </section>

      {/* Restore confirm dialog */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Restore</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the database from <strong>{restoreFile?.name}</strong>. An automatic backup of the
              current state will be created first, but this operation will replace all existing data. Are you sure you
              want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreConfirm}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
