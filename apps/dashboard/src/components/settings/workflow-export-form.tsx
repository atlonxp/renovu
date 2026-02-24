import { useState } from 'react';
import { RiDownloadLine } from 'react-icons/ri';
import { Button } from '@/components/primitives/button';
import { showErrorToast, showSuccessToast } from '@/components/primitives/sonner-helpers';
import { useExportWorkflows } from '@/hooks/use-export-workflows';
import { useEnvironment } from '@/context/environment/hooks';

export function WorkflowExportForm() {
  const { currentEnvironment } = useEnvironment();
  const exportMutation = useExportWorkflows();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!currentEnvironment?._id) return;
    setIsExporting(true);
    try {
      const data = await exportMutation.mutateAsync({
        environmentId: currentEnvironment._id,
      });

      // Save the export result as a JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const envName = currentEnvironment.name || 'export';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `workflows-${envName}-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const count = data.workflows?.length ?? 0;
      showSuccessToast(`Exported ${count} workflow${count !== 1 ? 's' : ''} from ${envName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      showErrorToast(message, 'Export Error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-foreground-600">
          Export all workflows from the current environment (<strong>{currentEnvironment?.name || '...'}</strong>) as a
          JSON file that can be imported into another ReNovu instance.
        </p>
      </div>
      <Button
        variant="secondary"
        mode="outline"
        size="sm"
        isLoading={isExporting}
        onClick={handleExport}
        leadingIcon={RiDownloadLine}
        disabled={!currentEnvironment?._id}
      >
        Export All Workflows
      </Button>
    </div>
  );
}
