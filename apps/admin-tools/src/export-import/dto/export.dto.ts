export class ExportRequestDto {
  workflowIds: string[];
  environmentId: string;
}

export class ExportedWorkflowPackage {
  version: string;
  exportedAt: string;
  workflows: any[];
  messageTemplates: any[];
  notificationGroups: any[];
  layouts: any[];
  controlValues: any[];
  feeds: any[];
}

export class ExportResponseDto {
  version: string;
  exportedAt: string;
  workflows: number;
  messageTemplates: number;
  notificationGroups: number;
  layouts: number;
  controlValues: number;
  feeds: number;
}
