import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InstrumentUsecase, isStringifiedMailyJSONContent, PinoLogger } from '@novu/application-generic';
import { StepTypeEnum } from '@novu/shared';
import OpenAI from 'openai';
import { AiProviderEnum } from '../../../ai-settings/dal/ai-settings.entity';
import { AiSettingsRepository } from '../../../ai-settings/dal/ai-settings.repository';
import {
  GeneratedStepDto,
  GenerateWorkflowResponseDto,
  GenerateWorkflowStepResponseDto,
} from '../../dtos/generate-workflow-response.dto';
import { GenerateWorkflowCommand, GenerateWorkflowStepCommand } from './generate-workflow.command';
import {
  buildStepRetryPrompt,
  buildStepUserPrompt,
  buildWorkflowRetryPrompt,
  buildWorkflowUserPrompt,
  SYSTEM_PROMPT_STEP,
  SYSTEM_PROMPT_WORKFLOW,
} from './generate-workflow.prompt';

const DEFAULT_MODEL = 'gpt-4o-mini';
const TEMPERATURE = 0.4;
const MAX_TOKENS = 4096;
const MAX_VALIDATION_RETRIES = 2;
const MAX_OPENAI_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

@Injectable()
export class GenerateWorkflowUsecase {
  constructor(
    private readonly aiSettingsRepository: AiSettingsRepository,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @InstrumentUsecase()
  async execute(command: GenerateWorkflowCommand): Promise<GenerateWorkflowResponseDto> {
    const startTime = Date.now();
    const { openai, model } = await this.resolveProvider(command.organizationId);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT_WORKFLOW },
      { role: 'user', content: buildWorkflowUserPrompt(command.prompt, command.channels) },
    ];

    let lastValidationError: string | undefined;
    let lastUsage: OpenAI.Completions.CompletionUsage | undefined;

    for (let attempt = 0; attempt < MAX_VALIDATION_RETRIES; attempt++) {
      const completion = await this.callOpenAIWithRetry(openai, model, messages);
      lastUsage = completion.usage;
      const rawContent = completion.choices[0]?.message?.content;

      if (!rawContent) {
        lastValidationError = 'Empty response from OpenAI';
      } else {
        const validation = this.parseAndValidateWorkflow(rawContent);

        if (validation.ok) {
          this.logger.info({
            event: 'workflow.ai.generated',
            orgId: command.organizationId,
            model,
            tokens: completion.usage,
            latencyMs: Date.now() - startTime,
            stepCount: validation.parsed.steps.length,
            attempts: attempt + 1,
          });

          return validation.parsed;
        }

        lastValidationError = validation.error;
        messages.push({ role: 'assistant', content: rawContent });
        messages.push({ role: 'user', content: buildWorkflowRetryPrompt(validation.error) });
      }
    }

    this.logger.warn({
      event: 'workflow.ai.generation_failed',
      orgId: command.organizationId,
      model,
      tokens: lastUsage,
      latencyMs: Date.now() - startTime,
      reason: lastValidationError,
    });

    throw new HttpException(
      {
        message: "Couldn't generate a valid workflow. Try simplifying your prompt.",
        code: 'AI_WORKFLOW_GENERATION_FAILED',
        details: lastValidationError,
      },
      422
    );
  }

  private parseAndValidateWorkflow(rawContent: string):
    | { ok: true; parsed: GenerateWorkflowResponseDto }
    | { ok: false; error: string } {
    const cleaned = stripCodeFences(rawContent.trim());

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      return { ok: false, error: `Response is not valid JSON: ${(error as Error).message}` };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Response must be a JSON object.' };
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
      return { ok: false, error: 'Missing required string field "name".' };
    }
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
      return { ok: false, error: 'Missing required non-empty "steps" array.' };
    }

    const validatedSteps: GeneratedStepDto[] = [];
    for (let i = 0; i < obj.steps.length; i++) {
      const stepResult = validateStep(obj.steps[i]);
      if (!stepResult.ok) {
        return { ok: false, error: `Step ${i + 1}: ${stepResult.error}` };
      }
      validatedSteps.push(stepResult.parsed);
    }

    return {
      ok: true,
      parsed: {
        name: obj.name.trim().slice(0, 64),
        description: typeof obj.description === 'string' ? obj.description.trim().slice(0, 256) : undefined,
        tags: normalizeTags(obj.tags),
        steps: validatedSteps,
      },
    };
  }

  async executeStep(command: GenerateWorkflowStepCommand): Promise<GenerateWorkflowStepResponseDto> {
    const startTime = Date.now();
    const { openai, model } = await this.resolveProvider(command.organizationId);

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT_STEP },
      { role: 'user', content: buildStepUserPrompt(command.prompt, command.type) },
    ];

    let lastValidationError: string | undefined;

    for (let attempt = 0; attempt < MAX_VALIDATION_RETRIES; attempt++) {
      const completion = await this.callOpenAIWithRetry(openai, model, messages);
      const rawContent = completion.choices[0]?.message?.content;

      if (!rawContent) {
        lastValidationError = 'Empty response from OpenAI';
      } else {
        const validation = validateStep(safeJsonParse(stripCodeFences(rawContent.trim())));

        if (validation.ok && validation.parsed.type === command.type) {
          this.logger.info({
            event: 'workflow.ai.step_generated',
            orgId: command.organizationId,
            model,
            tokens: completion.usage,
            latencyMs: Date.now() - startTime,
            type: command.type,
            attempts: attempt + 1,
          });

          return validation.parsed;
        }

        lastValidationError = validation.ok
          ? `Step type mismatch: requested ${command.type}, got ${validation.parsed.type}.`
          : validation.error;
        messages.push({ role: 'assistant', content: rawContent });
        messages.push({ role: 'user', content: buildStepRetryPrompt(lastValidationError, command.type) });
      }
    }

    throw new HttpException(
      {
        message: "Couldn't generate a valid step. Try a different prompt.",
        code: 'AI_STEP_GENERATION_FAILED',
        details: lastValidationError,
      },
      422
    );
  }

  private async resolveProvider(organizationId: string): Promise<{ openai: OpenAI; model: string }> {
    const settings = await this.aiSettingsRepository.findByOrganization(organizationId);
    if (!settings?.apiKey) {
      throw new BadRequestException({
        message: 'AI provider not configured for this organization. Configure it in Settings → AI.',
        code: 'OPENAI_KEY_NOT_CONFIGURED',
      });
    }

    if (settings.provider !== AiProviderEnum.OPENAI) {
      throw new BadRequestException({
        message: `Provider "${settings.provider}" is not yet supported for workflow generation.`,
        code: 'AI_PROVIDER_NOT_SUPPORTED',
      });
    }

    const model = settings.model || DEFAULT_MODEL;
    const openai = new OpenAI({ apiKey: settings.apiKey });

    return { openai, model };
  }

  private async callOpenAIWithRetry(
    openai: OpenAI,
    model: string,
    messages: ChatMessage[]
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_OPENAI_RETRIES; attempt++) {
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
        if (!isRetryableOpenAIError(lastError) || attempt === MAX_OPENAI_RETRIES - 1) break;
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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripCodeFences(text: string): string {
  const match = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);

  return match ? match[1].trim() : text;
}

function normalizeTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const cleaned = tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);

  return cleaned.length > 0 ? cleaned : undefined;
}

function isRetryableOpenAIError(error: Error): boolean {
  const message = error.message.toLowerCase();
  if (message.includes('401') || message.includes('invalid_api_key') || message.includes('unauthorized')) return false;
  if (message.includes('400') || message.includes('bad request')) return false;

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VALID_STEP_TYPES = new Set<string>(Object.values(StepTypeEnum));

function validateStep(input: unknown): { ok: true; parsed: GeneratedStepDto } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Step must be an object.' };
  }
  const step = input as Record<string, unknown>;

  if (typeof step.type !== 'string' || !VALID_STEP_TYPES.has(step.type)) {
    return { ok: false, error: `Invalid step type "${step.type}".` };
  }
  const type = step.type as StepTypeEnum;

  const name =
    typeof step.name === 'string' && step.name.trim().length > 0 ? step.name.trim().slice(0, 64) : defaultStepName(type);

  const controlValues = step.controlValues && typeof step.controlValues === 'object' && !Array.isArray(step.controlValues)
    ? (step.controlValues as Record<string, unknown>)
    : {};

  const channelValidation = validateControlValuesForType(type, controlValues);
  if (!channelValidation.ok) {
    return { ok: false, error: `Invalid controlValues for ${type}: ${channelValidation.error}` };
  }

  return { ok: true, parsed: { name, type, controlValues: channelValidation.normalized } };
}

function defaultStepName(type: StepTypeEnum): string {
  const map: Record<StepTypeEnum, string> = {
    [StepTypeEnum.IN_APP]: 'In-app notification',
    [StepTypeEnum.EMAIL]: 'Email',
    [StepTypeEnum.SMS]: 'SMS',
    [StepTypeEnum.PUSH]: 'Push notification',
    [StepTypeEnum.CHAT]: 'Chat message',
    [StepTypeEnum.DELAY]: 'Delay',
    [StepTypeEnum.DIGEST]: 'Digest',
    [StepTypeEnum.THROTTLE]: 'Throttle',
    [StepTypeEnum.TRIGGER]: 'Trigger',
    [StepTypeEnum.CUSTOM]: 'Custom step',
    [StepTypeEnum.HTTP_REQUEST]: 'HTTP request',
  };

  return map[type] ?? 'Step';
}

function validateControlValuesForType(
  type: StepTypeEnum,
  controlValues: Record<string, unknown>
): { ok: true; normalized: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};

  switch (type) {
    case StepTypeEnum.EMAIL: {
      if (typeof controlValues.subject !== 'string' || controlValues.subject.trim().length === 0) {
        return { ok: false, error: 'Email step requires a non-empty "subject".' };
      }
      out.subject = controlValues.subject.trim();
      out.editorType = 'block';
      const body =
        typeof controlValues.body === 'string'
          ? controlValues.body
          : controlValues.body !== undefined
            ? JSON.stringify(controlValues.body)
            : '';
      if (!body || !isStringifiedMailyJSONContent(body)) {
        return { ok: false, error: 'Email step body must be stringified Maily JSON ({ type: "doc", content: [...] }).' };
      }
      out.body = body;
      if (controlValues.from && typeof controlValues.from === 'object') out.from = controlValues.from;

      return { ok: true, normalized: out };
    }
    case StepTypeEnum.IN_APP: {
      const subject = typeof controlValues.subject === 'string' ? controlValues.subject.trim() : '';
      const body = typeof controlValues.body === 'string' ? controlValues.body.trim() : '';
      if (subject.length === 0 && body.length === 0) {
        return { ok: false, error: 'In-app step requires either "subject" or "body" non-empty.' };
      }
      if (subject) out.subject = subject;
      if (body) out.body = body;
      copyOptional(controlValues, out, ['avatar', 'primaryAction', 'secondaryAction', 'redirect', 'data']);

      return { ok: true, normalized: out };
    }
    case StepTypeEnum.SMS: {
      const body = typeof controlValues.body === 'string' ? controlValues.body.trim() : '';
      if (!body) return { ok: false, error: 'SMS step requires non-empty "body".' };
      out.body = body;

      return { ok: true, normalized: out };
    }
    case StepTypeEnum.PUSH: {
      const subject = typeof controlValues.subject === 'string' ? controlValues.subject.trim() : '';
      const body = typeof controlValues.body === 'string' ? controlValues.body.trim() : '';
      if (!subject || !body) return { ok: false, error: 'Push step requires both "subject" and "body".' };
      out.subject = subject;
      out.body = body;

      return { ok: true, normalized: out };
    }
    case StepTypeEnum.CHAT: {
      const body = typeof controlValues.body === 'string' ? controlValues.body.trim() : '';
      if (!body) return { ok: false, error: 'Chat step requires non-empty "body".' };
      out.body = body;

      return { ok: true, normalized: out };
    }
    case StepTypeEnum.DELAY:
    case StepTypeEnum.DIGEST:
    case StepTypeEnum.THROTTLE: {
      out.type = typeof controlValues.type === 'string' ? controlValues.type : 'regular';
      out.amount = typeof controlValues.amount === 'number' ? controlValues.amount : 1;
      out.unit = typeof controlValues.unit === 'string' ? controlValues.unit : 'minutes';
      copyOptional(controlValues, out, ['digestKey', 'throttleKey', 'cron']);

      return { ok: true, normalized: out };
    }
    case StepTypeEnum.CUSTOM:
    case StepTypeEnum.HTTP_REQUEST:
    case StepTypeEnum.TRIGGER:
      return { ok: true, normalized: {} };
    default:
      return { ok: false, error: `Unsupported step type "${type}".` };
  }
}

function copyOptional(src: Record<string, unknown>, dest: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    if (src[key] !== undefined && src[key] !== null) dest[key] = src[key];
  }
}
