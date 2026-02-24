export class CreateBackupResponseDto {
  filename: string;
  size: number;
  timestamp: string;
  collections: Record<string, number>;
  duration: number;
}

export class BackupListItemDto {
  filename: string;
  size: number;
  timestamp: string;
  collections: Record<string, number>;
}

export class BackupListResponseDto {
  backups: BackupListItemDto[];
  total: number;
}

export class DeleteBackupResponseDto {
  deleted: boolean;
  filename: string;
}
