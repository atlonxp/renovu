import { useQuery } from '@tanstack/react-query';
import { adminGet } from '@/api/admin-tools.client';
import { QueryKeys } from '@/utils/query-keys';

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
  path: string;
}

export interface BackupsResponse {
  backups: BackupInfo[];
  backupDir: string;
}

export function useFetchBackups() {
  return useQuery({
    queryKey: [QueryKeys.fetchBackups],
    queryFn: () => adminGet<BackupsResponse>('/api/backups'),
    refetchOnWindowFocus: true,
  });
}
