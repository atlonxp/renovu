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
    // GPT-6 family
    { value: 'gpt-6-luna', label: 'GPT-6 Luna (Fast, cost-effective)' },
    { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (Most capable)' },
    { value: 'gpt-6-sol', label: 'GPT-6 Sol' },
  ],
};

export const AI_PROVIDER_LABELS: Record<AiProviderEnum, string> = {
  [AiProviderEnum.OPENAI]: 'OpenAI',
};
