import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

import { AiProviderEnum, type AiSettingsEntity } from '../dal/ai-settings.entity';
import { AiSettingsRepository } from '../dal/ai-settings.repository';

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  model?: string;
  latencyMs?: number;
}

/**
 * Single entry point for chat-completion calls.
 * Branches on settings.provider; only OpenAI is wired up today.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly aiSettingsRepository: AiSettingsRepository) {}

  async resolveSettings(organizationId: string): Promise<AiSettingsEntity | null> {
    return this.aiSettingsRepository.findByOrganization(organizationId);
  }

  async testConnection(organizationId: string): Promise<ConnectionTestResult> {
    const settings = await this.aiSettingsRepository.findByOrganization(organizationId);

    if (!settings?.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    switch (settings.provider) {
      case AiProviderEnum.OPENAI:
        return this.testOpenAI(settings);
      default:
        return { success: false, error: `Unsupported provider: ${settings.provider}` };
    }
  }

  private async testOpenAI(settings: AiSettingsEntity): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      const openai = new OpenAI({ apiKey: settings.apiKey });
      const completion = await openai.chat.completions.create({
        model: settings.model,
        messages: [{ role: 'user', content: 'Respond with "OK" to confirm the connection works.' }],
        max_tokens: 10,
      });

      const latencyMs = Date.now() - startTime;
      const response = completion.choices[0]?.message?.content;

      if (response) {
        return { success: true, model: settings.model, latencyMs };
      }

      return { success: false, error: 'Empty response from API', model: settings.model, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('401') || errorMessage.includes('invalid_api_key')) {
        return { success: false, error: 'Invalid API key', latencyMs };
      }
      if (errorMessage.includes('429')) {
        return { success: false, error: 'Rate limit exceeded - please try again later', latencyMs };
      }

      return { success: false, error: errorMessage, latencyMs };
    }
  }
}
