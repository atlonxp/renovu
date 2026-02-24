import { useMutation } from '@tanstack/react-query';
import { adminPost } from '@/api/admin-tools.client';

export interface ExportWorkflowsRequest {
  workflowIds?: string[];
  environmentId?: string;
}

export interface ExportWorkflowsResponse {
  version: string;
  exportedAt: string;
  environment: {
    _id: string;
    name: string;
  };
  workflows: any[];
  notificationGroups: any[];
  layouts: any[];
}

export function useExportWorkflows() {
  return useMutation({
    mutationFn: (params: ExportWorkflowsRequest) =>
      adminPost<ExportWorkflowsResponse>('/api/export', { body: params }),
  });
}
