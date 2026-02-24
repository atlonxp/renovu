import { useRef, useState } from 'react';
import { RiUploadLine } from 'react-icons/ri';
import { Button } from '@/components/primitives/button';
import { showErrorToast, showSuccessToast } from '@/components/primitives/sonner-helpers';
import { useImportWorkflows, type ImportWorkflowsResult } from '@/hooks/use-import-workflows';
import { useEnvironment } from '@/context/environment/hooks';

export function WorkflowImportForm() {
  const { currentEnvironment } = useEnvironment();
  const importMutation = useImportWorkflows();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [importResult, setImportResult] = useState<ImportWorkflowsResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    try {
      const result = await importMutation.mutateAsync({
        file: selectedFile,
        environmentId: currentEnvironment?._id,
        strategy,
      });

      setImportResult(result);
      showSuccessToast(result.message || 'Import completed');
      // Reset file input
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      showErrorToast(message, 'Import Error');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-foreground-600">
          Import workflows from a JSON export file into the current environment (
          <strong>{currentEnvironment?.name || '...'}</strong>).
        </p>
      </div>

      {/* File upload */}
      <div className="space-y-2">
        <label className="text-label-sm text-text-strong block">Select File</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-200"
        />
      </div>

      {/* Strategy */}
      <div className="space-y-2">
        <label className="text-label-sm text-text-strong block">Conflict Strategy</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="import-strategy"
              value="skip"
              checked={strategy === 'skip'}
              onChange={() => setStrategy('skip')}
              className="accent-primary"
            />
            <span>Skip existing</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="import-strategy"
              value="overwrite"
              checked={strategy === 'overwrite'}
              onChange={() => setStrategy('overwrite')}
              className="accent-primary"
            />
            <span>Overwrite existing</span>
          </label>
        </div>
        <p className="text-xs text-foreground-400">
          {strategy === 'skip'
            ? 'Workflows with matching identifiers will be skipped.'
            : 'Workflows with matching identifiers will be overwritten with imported data.'}
        </p>
      </div>

      {/* Import button */}
      <Button
        variant="primary"
        mode="filled"
        size="sm"
        isLoading={importMutation.isPending}
        onClick={handleImport}
        leadingIcon={RiUploadLine}
        disabled={!selectedFile}
      >
        Import Workflows
      </Button>

      {/* Import results */}
      {importResult && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2">
          <h4 className="text-label-sm text-text-strong">Import Results</h4>
          <p className="text-sm text-foreground-600">Strategy: {importResult.strategy}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-foreground-400">Workflows created:</span>{' '}
              <strong>{importResult.results.workflows.created}</strong>
            </div>
            <div>
              <span className="text-foreground-400">Workflows updated:</span>{' '}
              <strong>{importResult.results.workflows.updated}</strong>
            </div>
            <div>
              <span className="text-foreground-400">Workflows skipped:</span>{' '}
              <strong>{importResult.results.workflows.skipped}</strong>
            </div>
            <div>
              <span className="text-foreground-400">Errors:</span>{' '}
              <strong>{importResult.results.workflows.errors}</strong>
            </div>
            <div>
              <span className="text-foreground-400">Groups created:</span>{' '}
              <strong>{importResult.results.notificationGroups.created}</strong>
            </div>
            <div>
              <span className="text-foreground-400">Layouts created:</span>{' '}
              <strong>{importResult.results.layouts.created}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
