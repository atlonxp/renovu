import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showErrorToast } from '@/components/primitives/sonner-helpers';
import { useEnvironment } from '@/context/environment/hooks';
import { QueryKeys } from '@/utils/query-keys';
import {
  updateTranslationSettings,
  TranslationSettingsDto,
  UpdateTranslationSettingsDto,
} from '../api/translation-settings';

/**
 * Hook to update or create translation settings (locale-only).
 *
 * AI provider config lives in `useAiSettings` / `useUpdateAiSettings`.
 */
export function useUpdateTranslationSettings() {
  const { currentEnvironment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation<
    TranslationSettingsDto,
    Error,
    UpdateTranslationSettingsDto,
    { previousData: TranslationSettingsDto | null | undefined }
  >({
    mutationFn: async (data) => {
      if (!currentEnvironment) {
        throw new Error('Environment not available. Please try again.');
      }
      return updateTranslationSettings({ data, environment: currentEnvironment });
    },
    onMutate: async (newSettings) => {
      const queryKey = [QueryKeys.translationSettings, currentEnvironment?._id];

      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<TranslationSettingsDto | null>(queryKey);

      if (previousData) {
        queryClient.setQueryData<TranslationSettingsDto>(queryKey, {
          ...previousData,
          ...newSettings,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousData };
    },
    onSuccess: (response) => {
      const queryKey = [QueryKeys.translationSettings, currentEnvironment?._id];

      queryClient.setQueryData(queryKey, response);
    },
    onError: (error, _variables, context) => {
      const queryKey = [QueryKeys.translationSettings, currentEnvironment?._id];

      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData);
      } else {
        queryClient.invalidateQueries({ queryKey });
      }

      showErrorToast(
        error?.message || 'There was an error updating translation settings.',
        'Failed to update translation settings'
      );
    },
  });
}
