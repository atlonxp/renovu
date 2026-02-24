import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ADMIN_TOOLS_HOSTNAME } from '@/config';
import { getToken } from '@/utils/auth';
import { AdminToolsApiError } from '@/api/admin-tools.client';
import { QueryKeys } from '@/utils/query-keys';

export interface RestoreResult {
  message: string;
  dryRun: boolean;
  restored: {
    collections: number;
    totalDocuments: number;
    details: Array<{ collection: string; documents: number }>;
  };
  duration?: number;
}

function transformApiResponse(raw: any): RestoreResult {
  const isDryRun = raw.dryRun === true;
  const collectionsMap: Record<string, number> = isDryRun ? raw.manifest?.collections ?? {} : raw.restored ?? {};

  const details = Object.entries(collectionsMap).map(([collection, documents]) => ({
    collection,
    documents: documents as number,
  }));
  const totalDocuments = details.reduce((sum, d) => sum + Math.max(d.documents, 0), 0);

  return {
    dryRun: isDryRun,
    message: isDryRun
      ? `Dry run complete. Backup contains ${details.length} collections with ${totalDocuments} documents.`
      : `Restored ${details.length} collections with ${totalDocuments} documents in ${raw.duration ?? 0}ms.`,
    restored: {
      collections: details.length,
      totalDocuments,
      details,
    },
    duration: raw.duration,
  };
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, dryRun = false }: { file: File; dryRun?: boolean }) => {
      const jwt = await getToken();
      const formData = new FormData();
      formData.append('file', file);

      const url = `${ADMIN_TOOLS_HOSTNAME}/api/restore${dryRun ? '?dryRun=true' : ''}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new AdminToolsApiError(errorData.message || 'Restore failed', response.status, errorData);
      }

      const raw = await response.json();

      return transformApiResponse(raw);
    },
    onSuccess: (data) => {
      if (!data.dryRun) {
        queryClient.invalidateQueries({ queryKey: [QueryKeys.fetchBackups] });
      }
    },
  });
}
