import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminPost } from '@/api/admin-tools.client';
import { QueryKeys } from '@/utils/query-keys';

export interface CreateBackupResponse {
  message: string;
  backup: {
    filename: string;
    size: number;
    collections: number;
    totalDocuments: number;
  };
}

function transformBackupResponse(raw: any): CreateBackupResponse {
  const collectionsMap: Record<string, number> = raw.collections ?? {};
  const collectionCount = Object.keys(collectionsMap).length;
  const totalDocuments = Object.values(collectionsMap).reduce((sum: number, n: any) => sum + (n as number), 0);

  return {
    message: `Backup created: ${raw.filename}`,
    backup: {
      filename: raw.filename,
      size: raw.size,
      collections: collectionCount,
      totalDocuments,
    },
  };
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const raw = await adminPost<any>('/api/backup');

      return transformBackupResponse(raw);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.fetchBackups] });
    },
  });
}
