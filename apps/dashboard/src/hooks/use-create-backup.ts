import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminPost } from '@/api/admin-tools.client';
import { QueryKeys } from '@/utils/query-keys';

export interface CreateBackupResponse {
  message: string;
  backup: {
    filename: string;
    size: number;
    path: string;
    collections: number;
    totalDocuments: number;
  };
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminPost<CreateBackupResponse>('/api/backup'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.fetchBackups] });
    },
  });
}
