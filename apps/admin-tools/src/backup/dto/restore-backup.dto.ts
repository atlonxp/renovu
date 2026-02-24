export class RestorePreviewDto {
  dryRun: true;
  manifest: {
    timestamp: string;
    version: string;
    collections: Record<string, number>;
  };
}

export class RestoreResultDto {
  dryRun: false;
  restored: Record<string, number>;
  duration: number;
  timestamp: string;
}

export type RestoreResponseDto = RestorePreviewDto | RestoreResultDto;
