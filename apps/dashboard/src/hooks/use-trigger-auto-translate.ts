import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerAutoTranslate } from '@/api/translations';
import { showErrorToast, showSuccessToast, showWarningToast } from '@/components/primitives/sonner-helpers';
import { useEnvironment } from '@/context/environment/hooks';
import { QueryKeys } from '@/utils/query-keys';
import { OmitEnvironmentFromParameters } from '@/utils/types';

type TriggerAutoTranslateParameters = OmitEnvironmentFromParameters<typeof triggerAutoTranslate>;

export const useTriggerAutoTranslate = ({ onSuccess }: { onSuccess?: () => void } = {}) => {
  const { currentEnvironment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: TriggerAutoTranslateParameters) =>
      triggerAutoTranslate({ environment: currentEnvironment!, ...args }),
    onSuccess: async (data, variables) => {
      // Invalidate translation queries to refetch with new content
      await queryClient.invalidateQueries({
        queryKey: [QueryKeys.fetchTranslation, variables.resourceId, variables.resourceType],
        exact: false,
      });

      await queryClient.invalidateQueries({
        queryKey: [
          QueryKeys.fetchTranslationGroup,
          variables.resourceId,
          variables.resourceType,
          currentEnvironment?._id,
        ],
      });

      await queryClient.invalidateQueries({
        queryKey: [QueryKeys.fetchTranslationGroups],
        exact: false,
      });

      // Check results
      const { metadata, results } = data;

      if (metadata.failedLocales > 0 && metadata.successfulLocales > 0) {
        // Partial success
        const failedLocales = results.filter((r) => !r.success).map((r) => r.locale);
        showWarningToast(
          `Translated ${metadata.successfulLocales} of ${metadata.totalLocales} locales. Failed: ${failedLocales.join(', ')}`,
          'Partial Translation'
        );
      } else if (metadata.failedLocales > 0) {
        // All failed
        const errors = results
          .filter((r) => !r.success)
          .map((r) => `${r.locale}: ${r.error}`)
          .join('\n');
        showErrorToast(errors, 'Translation failed');
      } else {
        // All success
        const targetInfo = variables.targetLocales?.length
          ? `to ${variables.targetLocales.join(', ')}`
          : `to ${metadata.totalLocales} locales`;
        showSuccessToast(`Translation completed ${targetInfo}`);
      }

      onSuccess?.();
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to trigger auto-translation';
      showErrorToast(errorMessage, 'Translation failed');
    },
  });
};
