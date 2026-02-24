import { useState } from 'react';
import { RiDeleteBinLine, RiDownloadLine } from 'react-icons/ri';
import { Button } from '@/components/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/primitives/table';
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
import { showErrorToast, showSuccessToast } from '@/components/primitives/sonner-helpers';
import { adminDel, adminDownload } from '@/api/admin-tools.client';
import { QueryKeys } from '@/utils/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import type { BackupInfo } from '@/hooks/use-fetch-backups';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BackupList({ backups, isLoading }: { backups: BackupInfo[]; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleDownload = async (filename: string) => {
    setDownloadingFile(filename);
    try {
      const blob = await adminDownload(`/api/backups/${encodeURIComponent(filename)}/download`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccessToast(`Downloaded ${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      showErrorToast(message, 'Download Error');
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;
    setDeletingFile(fileToDelete);
    try {
      await adminDel(`/api/backups/${encodeURIComponent(fileToDelete)}`);
      showSuccessToast(`Deleted ${fileToDelete}`);
      queryClient.invalidateQueries({ queryKey: [QueryKeys.fetchBackups] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      showErrorToast(message, 'Delete Error');
    } finally {
      setDeletingFile(null);
      setFileToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  if (isLoading) {
    return (
      <Table isLoading loadingRowsCount={3}>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );
  }

  if (!backups || backups.length === 0) {
    return <p className="text-foreground-600 text-sm py-4">No backups found. Create your first backup above.</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filename</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {backups.map((backup) => (
            <TableRow key={backup.filename}>
              <TableCell className="font-mono text-xs">{backup.filename}</TableCell>
              <TableCell className="text-sm">{formatDate(backup.createdAt)}</TableCell>
              <TableCell className="text-sm">{formatBytes(backup.size)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    mode="ghost"
                    size="xs"
                    isLoading={downloadingFile === backup.filename}
                    onClick={() => handleDownload(backup.filename)}
                    leadingIcon={RiDownloadLine}
                  >
                    Download
                  </Button>
                  <Button
                    variant="error"
                    mode="ghost"
                    size="xs"
                    isLoading={deletingFile === backup.filename}
                    onClick={() => {
                      setFileToDelete(backup.filename);
                      setDeleteConfirmOpen(true);
                    }}
                    leadingIcon={RiDeleteBinLine}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{fileToDelete}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
