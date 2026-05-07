import type { IEnvironment } from '@novu/shared';
import { del, get, put } from './api.client';

/**
 * Translation settings DTO (locale-only).
 *
 * AI provider config (API key + model) lives at `/v1/ai-settings`. See
 * `api/ai-settings.ts`.
 */
export type TranslationSettingsDto = {
  _id: string;
  _organizationId: string;
  defaultLocale: string;
  targetLocales: string[];
  /** Custom locale aliases for mapping external locale codes (e.g., { "zh-hans": "zh_CN" }) */
  localeAliases?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type UpdateTranslationSettingsDto = {
  defaultLocale?: string;
  targetLocales?: string[];
  localeAliases?: Record<string, string>;
};

export async function getTranslationSettings({
  environment,
}: {
  environment: IEnvironment;
}): Promise<TranslationSettingsDto | null> {
  const response = await get<{ data: TranslationSettingsDto | null }>('/translation-settings', { environment });

  return response.data;
}

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

export async function deleteTranslationSettings({
  environment,
}: {
  environment: IEnvironment;
}): Promise<void> {
  await del<void>('/translation-settings', { environment });
}
