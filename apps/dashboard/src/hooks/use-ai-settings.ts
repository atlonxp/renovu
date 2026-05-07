import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showErrorToast } from '@/components/primitives/sonner-helpers';
import { useEnvironment } from '@/context/environment/hooks';
import { QueryKeys } from '@/utils/query-keys';
import {
  AiSettingsDto,
  UpdateAiSettingsDto,
  getAiSettings,
  updateAiSettings,
} from '../api/ai-settings';

export function useAiSettings() {
  const { currentEnvironment } = useEnvironment();

  return useQuery<AiSettingsDto | null>({
    queryKey: [QueryKeys.aiSettings, currentEnvironment?._id],
    queryFn: async () => {
      return getAiSettings({ environment: currentEnvironment! });
    },
    enabled: !!currentEnvironment?._id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateAiSettings() {
  const { currentEnvironment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation<AiSettingsDto, Error, UpdateAiSettingsDto>({
    mutationFn: async (data) => {
      if (!currentEnvironment) {
        throw new Error('Environment not available. Please try again.');
      }
      return updateAiSettings({ data, environment: currentEnvironment });
    },
    onSuccess: (response) => {
      const queryKey = [QueryKeys.aiSettings, currentEnvironment?._id];
      queryClient.setQueryData(queryKey, response);
    },
    onError: (error) => {
      showErrorToast(
        error?.message || 'There was an error updating AI settings.',
        'Failed to update AI settings'
      );
    },
  });
}
