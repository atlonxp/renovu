import type { IEnvironment } from '@novu/shared';
import { del, get, post, put } from './api.client';

export enum AiProviderEnum {
  OPENAI = 'openai',
}

export type AiSettingsDto = {
  _id: string;
  _organizationId: string;
  hasApiKey: boolean;
  apiKeyLast4?: string;
  provider: AiProviderEnum;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateAiSettingsDto = {
  provider?: AiProviderEnum;
  apiKey?: string;
  model?: string;
};

export type ConnectionTestResponseDto = {
  success: boolean;
  message: string;
  model?: string;
  latencyMs?: number;
  error?: string;
};

export async function getAiSettings({
  environment,
}: {
  environment: IEnvironment;
}): Promise<AiSettingsDto | null> {
  const response = await get<{ data: AiSettingsDto | null }>('/ai-settings', { environment });

  return response.data;
}

export async function updateAiSettings({
  data,
  environment,
}: {
  data: UpdateAiSettingsDto;
  environment: IEnvironment;
}): Promise<AiSettingsDto> {
  const response = await put<{ data: AiSettingsDto }>('/ai-settings', { body: data, environment });

  return response.data;
}

export async function testAiConnection({
  environment,
}: {
  environment: IEnvironment;
}): Promise<ConnectionTestResponseDto> {
  const response = await post<{ data: ConnectionTestResponseDto }>('/ai-settings/test', { environment });

  return response.data;
}

export async function deleteAiSettings({ environment }: { environment: IEnvironment }): Promise<void> {
  await del<void>('/ai-settings', { environment });
}

/**
 * Models offered per provider in the UI. The backend stores `model` as a
 * free-form string; this list controls what users can pick.
 */
export const AI_PROVIDER_MODELS: Record<AiProviderEnum, { value: string; label: string }[]> = {
  [AiProviderEnum.OPENAI]: [
    // GPT-5 family
    { value: 'gpt-5.5', label: 'GPT-5.5' },
    { value: 'gpt-5.5-mini', label: 'GPT-5.5 Mini' },
    { value: 'gpt-5.1', label: 'GPT-5.1' },
    { value: 'gpt-5.1-mini', label: 'GPT-5.1 Mini' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    // GPT-4.5
    { value: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
    // GPT-4.1 family
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    // GPT-4o family
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Cost-effective)' },
    // Legacy
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
};

export const AI_PROVIDER_LABELS: Record<AiProviderEnum, string> = {
  [AiProviderEnum.OPENAI]: 'OpenAI',
};
