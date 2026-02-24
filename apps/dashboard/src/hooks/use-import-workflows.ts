import { useMutation } from '@tanstack/react-query';
import { ADMIN_TOOLS_HOSTNAME } from '@/config';
import { getToken } from '@/utils/auth';
import { AdminToolsApiError } from '@/api/admin-tools.client';

export interface ImportWorkflowsResult {
  message: string;
  strategy: string;
  results: {
    workflows: {
      created: number;
      updated: number;
      skipped: number;
      errors: number;
    };
    notificationGroups: {
      created: number;
      existing: number;
    };
    layouts: {
      created: number;
      existing: number;
    };
  };
}

export function useImportWorkflows() {
  return useMutation({
    mutationFn: async ({
      file,
      environmentId,
      organizationId,
      strategy = 'skip',
    }: {
      file: File;
      environmentId?: string;
      organizationId?: string;
      strategy?: 'skip' | 'overwrite';
    }) => {
      const jwt = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      if (environmentId) formData.append('environmentId', environmentId);
      if (organizationId) formData.append('organizationId', organizationId);
      formData.append('strategy', strategy);

      const response = await fetch(`${ADMIN_TOOLS_HOSTNAME}/api/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new AdminToolsApiError(errorData.message || 'Import failed', response.status, errorData);
      }

      return response.json() as Promise<ImportWorkflowsResult>;
    },
  });
}
