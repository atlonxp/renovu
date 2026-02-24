import { useQuery } from '@tanstack/react-query';
import { adminGet } from '@/api/admin-tools.client';
import { QueryKeys } from '@/utils/query-keys';

export interface BackupInfo {
  filename: string;
  size: number;
  timestamp: string;
  collections: Record<string, number>;
}

export interface BackupsResponse {
  backups: BackupInfo[];
  total: number;
}

export function useFetchBackups() {
  return useQuery({
    queryKey: [QueryKeys.fetchBackups],
    queryFn: () => adminGet<BackupsResponse>('/api/backups'),
    refetchOnWindowFocus: true,
  });
}
