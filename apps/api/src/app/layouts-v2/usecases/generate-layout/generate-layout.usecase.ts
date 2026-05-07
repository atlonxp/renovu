import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InstrumentUsecase, isStringifiedMailyJSONContent, PinoLogger } from '@novu/application-generic';
import { LAYOUT_CONTENT_VARIABLE, LayoutContainerConfig } from '@novu/shared';
import OpenAI from 'openai';
import { AiProviderEnum } from '../../../ai-settings/dal/ai-settings.entity';
import { AiSettingsRepository } from '../../../ai-settings/dal/ai-settings.repository';
import { GenerateLayoutResponseDto } from '../../dtos/generate-layout-response.dto';
import { GenerateLayoutCommand } from './generate-layout.command';
import { buildRetryPrompt, buildUserPrompt, SYSTEM_PROMPT } from './generate-layout.prompt';

const DEFAULT_MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.4;
const MAX_TOKENS = 4096;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type ParsedResponse = { body: string; container?: LayoutContainerConfig; rawObject: { body: unknown; container?: unknown } };

@Injectable()
export class GenerateLayoutUsecase {
  constructor(
    private readonly aiSettingsRepository: AiSettingsRepository,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @InstrumentUsecase()
  async execute(command: GenerateLayoutCommand): Promise<GenerateLayoutResponseDto> {
    const startTime = Date.now();

    const settings = await this.aiSettingsRepository.findByOrganization(command.organizationId);
    if (!settings?.apiKey) {
      throw new BadRequestException({
        message: 'AI provider not configured for this organization. Configure it in Settings → AI.',
        code: 'OPENAI_KEY_NOT_CONFIGURED',
      });
    }

    if (settings.provider !== AiProviderEnum.OPENAI) {
      throw new BadRequestException({
        message: `Provider "${settings.provider}" is not yet supported for layout generation.`,
        code: 'AI_PROVIDER_NOT_SUPPORTED',
      });
    }

    const model = settings.model || DEFAULT_MODEL;
    const openai = new OpenAI({ apiKey: settings.apiKey });

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(command.prompt) },
    ];

    let lastValidationError: string | undefined;
    let lastUsage: OpenAI.Completions.CompletionUsage | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const completion = await this.callOpenAIWithRetry(openai, model, messages);
      lastUsage = completion.usage;
      const rawContent = completion.choices[0]?.message?.content;

      if (!rawContent) {
        lastValidationError = 'Empty response from OpenAI';
      } else {
        const validation = this.parseAndValidate(rawContent);

        if (validation.ok) {
          this.logger.info({
            event: 'layout.ai.generated',
            orgId: command.organizationId,
            model,
            tokens: completion.usage,
            latencyMs: Date.now() - startTime,
            attempts: attempt + 1,
          });

          return {
            body: validation.parsed.body,
            container: validation.parsed.container,
          };
        }

        lastValidationError = validation.error;
        messages.push({ role: 'assistant', content: rawContent });
        messages.push({ role: 'user', content: buildRetryPrompt(validation.error) });
      }
    }

    this.logger.warn({
      event: 'layout.ai.generation_failed',
      orgId: command.organizationId,
      model,
      tokens: lastUsage,
      latencyMs: Date.now() - startTime,
      reason: lastValidationError,
    });

    throw new HttpException(
      {
        message: "Couldn't generate a valid layout. Try simplifying your prompt.",
        code: 'AI_LAYOUT_GENERATION_FAILED',
        details: lastValidationError,
      },
      422
    );
  }

  private parseAndValidate(rawContent: string):
    | { ok: true; parsed: { body: string; container?: LayoutContainerConfig } }
    | { ok: false; error: string } {
    const cleaned = stripCodeFences(rawContent.trim());

    let parsed: ParsedResponse['rawObject'];
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      return { ok: false, error: `Response is not valid JSON: ${(error as Error).message}` };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Response must be a JSON object with `body` and optional `container` keys.' };
    }

    if (parsed.body === undefined) {
      return { ok: false, error: 'Response is missing the required `body` key.' };
    }

    const bodyString = typeof parsed.body === 'string' ? parsed.body : JSON.stringify(parsed.body);

    if (!isStringifiedMailyJSONContent(bodyString)) {
      return { ok: false, error: '`body` is not a valid Maily document (must be `{ type: "doc", content: [...] }`).' };
    }

    const contentSlotCount = countContentSlots(JSON.parse(bodyString));
    if (contentSlotCount !== 1) {
      return {
        ok: false,
        error: `The document must contain EXACTLY ONE variable node with attrs.id = "${LAYOUT_CONTENT_VARIABLE}". Found ${contentSlotCount}.`,
      };
    }

    const container = normalizeContainer(parsed.container);

    return { ok: true, parsed: { body: bodyString, container } };
  }

  private async callOpenAIWithRetry(
    openai: OpenAI,
    model: string,
    messages: ChatMessage[]
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const maxAttempts = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await openai.chat.completions.create({
          model,
          messages,
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
        });
      } catch (error) {
        lastError = error as Error;
        if (!isRetryableOpenAIError(lastError) || attempt === maxAttempts - 1) {
          break;
        }
        const delay = Math.min(BASE_DELAY_MS * 2 ** attempt + Math.random() * 500, MAX_DELAY_MS);
        await sleep(delay);
      }
    }

    if (lastError && /429|rate limit/i.test(lastError.message)) {
      throw new ServiceUnavailableException({
        message: 'AI generation is temporarily unavailable due to rate limiting. Try again shortly.',
        code: 'OPENAI_RATE_LIMITED',
      });
    }

    throw new ServiceUnavailableException({
      message: 'AI generation is temporarily unavailable. Try again shortly.',
      code: 'OPENAI_UNAVAILABLE',
      details: lastError?.message,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOpenAIError(error: Error): boolean {
  const message = error.message.toLowerCase();
  if (message.includes('401') || message.includes('invalid_api_key') || message.includes('unauthorized')) {
    return false;
  }
  if (message.includes('400') || message.includes('bad request')) {
    return false;
  }

  return true;
}

function stripCodeFences(text: string): string {
  const match = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);

  return match ? match[1].trim() : text;
}

function countContentSlots(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  const typed = node as { type?: string; attrs?: { id?: string }; content?: unknown[] };
  let count = 0;
  if (typed.type === 'variable' && typed.attrs?.id === LAYOUT_CONTENT_VARIABLE) {
    count += 1;
  }
  if (Array.isArray(typed.content)) {
    for (const child of typed.content) {
      count += countContentSlots(child);
    }
  }

  return count;
}

function normalizeContainer(input: unknown): LayoutContainerConfig | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;
  const out: LayoutContainerConfig = {};
  if (typeof obj.maxWidth === 'string') out.maxWidth = obj.maxWidth;
  if (obj.align === 'left' || obj.align === 'center' || obj.align === 'right') out.align = obj.align;
  if (typeof obj.padding === 'string') out.padding = obj.padding;
  if (typeof obj.backgroundColor === 'string') out.backgroundColor = obj.backgroundColor;

  return Object.keys(out).length > 0 ? out : undefined;
}
