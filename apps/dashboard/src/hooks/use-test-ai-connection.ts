import { useMutation } from '@tanstack/react-query';
import { showErrorToast } from '@/components/primitives/sonner-helpers';
import { useEnvironment } from '@/context/environment/hooks';
import { ConnectionTestResponseDto, testAiConnection } from '../api/ai-settings';

export function useTestAiConnection() {
  const { currentEnvironment } = useEnvironment();

  return useMutation<ConnectionTestResponseDto, Error, void>({
    mutationFn: async () => {
      if (!currentEnvironment) {
        throw new Error('Environment not available. Please try again.');
      }
      return testAiConnection({ environment: currentEnvironment });
    },
    onError: (error) => {
      showErrorToast(error?.message || 'Connection test failed. Please check your API key.', 'Connection test failed');
    },
  });
}
