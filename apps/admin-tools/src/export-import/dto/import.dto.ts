export type ImportStrategy = 'skip' | 'overwrite';

export class ImportCountsDto {
  workflows: number;
  messageTemplates: number;
  notificationGroups: number;
  layouts: number;
  controlValues: number;
  feeds: number;
}

export class ImportErrorDto {
  entity: string;
  exportId?: string;
  identifier?: string;
  message: string;
}

export class ImportResponseDto {
  imported: ImportCountsDto;
  skipped: ImportCountsDto;
  errors: ImportErrorDto[];
  duration: number;
}
