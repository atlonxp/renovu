import type { IEnvironment } from '@novu/shared';
import { del, get, post, put } from './api.client';

/**
 * OpenAI models supported for translation
 */
export enum OpenAIModelEnum {
  GPT_4O_MINI = 'gpt-4o-mini',
  GPT_4O = 'gpt-4o',
  GPT_4_TURBO = 'gpt-4-turbo',
}

/**
 * Translation settings response DTO
 *
 * Returned from GET and PUT endpoints.
 * The actual API key is never exposed - only presence flag and last 4 chars.
 */
export type TranslationSettingsDto = {
  _id: string;
  _organizationId: string;
  hasApiKey: boolean;
  apiKeyLast4?: string;
  openaiModel: OpenAIModelEnum;
  defaultLocale: string;
  targetLocales: string[];
  /** Custom locale aliases for mapping external locale codes (e.g., { "zh-hans": "zh_CN" }) */
  localeAliases?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

/**
 * Request DTO for updating translation settings
 *
 * All fields are optional to support partial updates.
 */
export type UpdateTranslationSettingsDto = {
  openaiApiKey?: string;
  openaiModel?: OpenAIModelEnum;
  defaultLocale?: string;
  targetLocales?: string[];
  /** Custom locale aliases for mapping external locale codes (e.g., { "zh-hans": "zh_CN" }) */
  localeAliases?: Record<string, string>;
};

/**
 * Response DTO for connection test
 */
export type ConnectionTestResponseDto = {
  success: boolean;
  message: string;
  model?: string;
  latencyMs?: number;
  error?: string;
};

/**
 * Get translation settings for the current organization
 *
 * @param params - Request parameters
 * @param params.environment - Current environment
 * @returns Translation settings or null if not configured
 */
export async function getTranslationSettings({
  environment,
}: {
  environment: IEnvironment;
}): Promise<TranslationSettingsDto | null> {
  const response = await get<{ data: TranslationSettingsDto | null }>('/translation-settings', { environment });

  return response.data;
}

/**
 * Update or create translation settings
 *
 * Performs an upsert - creates settings if they don't exist,
 * or updates existing settings with provided values.
 * Supports partial updates.
 *
 * @param params - Request parameters
 * @param params.data - Settings to update
 * @param params.environment - Current environment
 * @returns Updated translation settings
 */
export async function updateTranslationSettings({
  data,
  environment,
}: {
  data: UpdateTranslationSettingsDto;
  environment: IEnvironment;
}): Promise<TranslationSettingsDto> {
  const response = await put<{ data: TranslationSettingsDto }>('/translation-settings', {
    body: data,
    environment,
  });

  return response.data;
}

/**
 * Test OpenAI connection with configured API key
 *
 * Performs a minimal API call to verify:
 * - API key is valid
 * - API key has appropriate permissions
 * - Network connectivity is working
 *
 * @param params - Request parameters
 * @param params.environment - Current environment
 * @returns Connection test result
 */
export async function testTranslationConnection({
  environment,
}: {
  environment: IEnvironment;
}): Promise<ConnectionTestResponseDto> {
  const response = await post<{ data: ConnectionTestResponseDto }>('/translation-settings/test', {
    environment,
  });

  return response.data;
}

/**
 * Delete translation settings for the current organization
 *
 * Removes all translation settings. This will disable
 * automatic translation until settings are reconfigured.
 *
 * @param params - Request parameters
 * @param params.environment - Current environment
 */
export async function deleteTranslationSettings({
  environment,
}: {
  environment: IEnvironment;
}): Promise<void> {
  await del<void>('/translation-settings', { environment });
}
