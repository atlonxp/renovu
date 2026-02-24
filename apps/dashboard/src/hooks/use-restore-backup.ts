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
  autoBackup?: {
    filename: string;
    size: number;
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

      return response.json() as Promise<RestoreResult>;
    },
    onSuccess: (data) => {
      if (!data.dryRun) {
        queryClient.invalidateQueries({ queryKey: [QueryKeys.fetchBackups] });
      }
    },
  });
}
