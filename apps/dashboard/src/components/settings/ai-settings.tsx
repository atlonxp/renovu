import { PermissionsEnum } from '@novu/shared';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { RiLoader4Line } from 'react-icons/ri';
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODELS,
  AiProviderEnum,
} from '@/api/ai-settings';
import { Button } from '@/components/primitives/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormRoot,
} from '@/components/primitives/form/form';
import { InlineToast } from '@/components/primitives/inline-toast';
import { PermissionButton } from '@/components/primitives/permission-button';
import { SecretInput } from '@/components/primitives/secret-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Skeleton } from '@/components/primitives/skeleton';
import { showSuccessToast } from '@/components/primitives/sonner-helpers';
import { useAiSettings, useUpdateAiSettings } from '@/hooks/use-ai-settings';
import { useTestAiConnection } from '@/hooks/use-test-ai-connection';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

interface AiSettingsFormData {
  provider: AiProviderEnum;
  apiKey: string;
  model: string;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export function AiSettings() {
  const { data: aiSettings, isLoading, refetch } = useAiSettings();
  const updateSettings = useUpdateAiSettings();
  const testConnection = useTestAiConnection();

  const [connectionTestResult, setConnectionTestResult] = useState<ConnectionTestResult | null>(null);

  const form = useForm<AiSettingsFormData>({
    defaultValues: {
      provider: AiProviderEnum.OPENAI,
      apiKey: '',
      model: DEFAULT_OPENAI_MODEL,
    },
  });

  const { reset, watch } = form;
  const currentApiKey = watch('apiKey');
  const currentProvider = watch('provider');

  useEffect(() => {
    if (aiSettings) {
      reset({
        provider: aiSettings.provider || AiProviderEnum.OPENAI,
        apiKey: '',
        model: aiSettings.model || DEFAULT_OPENAI_MODEL,
      });
    }
  }, [aiSettings, reset]);

  const canTestConnection = Boolean(currentApiKey) || Boolean(aiSettings?.hasApiKey);

  const handleSave = useCallback(async () => {
    const formValues = form.getValues();

    try {
      await updateSettings.mutateAsync({
        provider: formValues.provider,
        ...(formValues.apiKey ? { apiKey: formValues.apiKey } : {}),
        model: formValues.model,
      });

      showSuccessToast('AI settings updated');
      form.setValue('apiKey', '');
      refetch();
    } catch {
      // Error toast is shown by the mutation hook
    }
  }, [form, updateSettings, refetch]);

  const handleTestConnection = useCallback(async () => {
    setConnectionTestResult(null);

    const formValues = form.getValues();
    if (formValues.apiKey) {
      try {
        await updateSettings.mutateAsync({
          provider: formValues.provider,
          apiKey: formValues.apiKey,
          model: formValues.model,
        });
        form.setValue('apiKey', '');
        await refetch();
      } catch {
        setConnectionTestResult({ success: false, message: 'Failed to save API key before testing' });
        return;
      }
    }

    try {
      const result = await testConnection.mutateAsync();
      setConnectionTestResult({
        success: result.success,
        message: result.error || result.message,
        latencyMs: result.latencyMs,
      });
    } catch {
      setConnectionTestResult({ success: false, message: 'Connection test failed. Please check your API key.' });
    }
  }, [form, testConnection, updateSettings, refetch]);

  const modelOptions = AI_PROVIDER_MODELS[currentProvider] ?? [];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-label-sm text-text-strong mb-1">AI Provider</h2>
        <p className="text-sm text-foreground-600 mb-4">
          Configure the AI provider used for layout generation, workflow generation, and translations. The API key is
          encrypted at rest.
        </p>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <Form {...form}>
            <FormRoot className="space-y-4">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-text-sub">Provider</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AI_PROVIDER_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel
                      className="text-text-sub gap-1"
                      tooltip="Your provider API key. Stored encrypted at rest, never returned in responses."
                    >
                      API Key
                    </FormLabel>
                    <FormControl>
                      <SecretInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={
                          aiSettings?.hasApiKey ? `••••${aiSettings.apiKeyLast4 || '****'}` : 'sk-...'
                        }
                        className="w-full"
                      />
                    </FormControl>
                    <span className="text-text-soft text-2xs">
                      {aiSettings?.hasApiKey
                        ? 'API key configured. Enter a new key to replace it.'
                        : 'Enter your API key to enable AI features.'}
                    </span>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-text-sub">Model</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {modelOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="secondary"
                  mode="outline"
                  size="xs"
                  onClick={handleTestConnection}
                  disabled={!canTestConnection || testConnection.isPending}
                >
                  {testConnection.isPending ? (
                    <>
                      <RiLoader4Line className="mr-1.5 size-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>

                {connectionTestResult && (
                  <InlineToast
                    variant={connectionTestResult.success ? 'success' : 'error'}
                    title={connectionTestResult.success ? 'Connection successful' : 'Connection failed'}
                    description={
                      connectionTestResult.success
                        ? `${connectionTestResult.message || 'OK'}${connectionTestResult.latencyMs ? ` (${connectionTestResult.latencyMs}ms)` : ''}`
                        : connectionTestResult.message
                    }
                  />
                )}
              </div>

              <div className="flex justify-end pt-2">
                <PermissionButton
                  permission={PermissionsEnum.WORKFLOW_WRITE}
                  variant="secondary"
                  onClick={handleSave}
                  disabled={updateSettings.isPending}
                  isLoading={updateSettings.isPending}
                >
                  Save changes
                </PermissionButton>
              </div>
            </FormRoot>
          </Form>
        )}
      </section>
    </div>
  );
}
