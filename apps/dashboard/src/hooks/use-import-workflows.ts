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

function transformImportResponse(raw: any, strategy: string): ImportWorkflowsResult {
  const imported = raw.imported ?? {};
  const skipped = raw.skipped ?? {};
  const errors = raw.errors ?? [];

  const workflowsCreated = imported.workflows ?? 0;
  const workflowsSkipped = skipped.workflows ?? 0;

  return {
    message:
      workflowsCreated > 0
        ? `Imported ${workflowsCreated} workflow(s) successfully`
        : `All ${workflowsSkipped} workflow(s) skipped (already exist)`,
    strategy,
    results: {
      workflows: {
        created: workflowsCreated,
        updated: strategy === 'overwrite' ? workflowsCreated : 0,
        skipped: workflowsSkipped,
        errors: errors.length,
      },
      notificationGroups: {
        created: imported.notificationGroups ?? 0,
        existing: skipped.notificationGroups ?? 0,
      },
      layouts: {
        created: imported.layouts ?? 0,
        existing: skipped.layouts ?? 0,
      },
    },
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

      const raw = await response.json();

      return transformImportResponse(raw, strategy);
    },
  });
}
