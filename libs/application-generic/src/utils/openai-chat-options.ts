/**
 * ReNOVU: default OpenAI model for AI Settings, translation and AI generation.
 * GPT-6 Luna is the fast, cost-effective GPT-6 model; GPT-6.1 Sol is the most capable one.
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

/**
 * Chat models that still take sampling parameters. Newer OpenAI models (GPT-5.x, GPT-6 Sol/Luna/Astra,
 * o-series) are reasoning models: they reject `max_tokens` and any non-default `temperature`.
 */
const SAMPLING_MODEL_PATTERN = /^(gpt-3\.5|gpt-4o|gpt-4\.1|gpt-4-|gpt-4$|chatgpt-4o)/;

/** Reasoning tokens count toward `max_completion_tokens`, so reasoning models get extra room. */
const REASONING_TOKEN_HEADROOM = 2048;

export interface OpenAiChatOptions {
  max_completion_tokens: number;
  temperature?: number;
  reasoning_effort?: 'low';
}

export function isOpenAiSamplingModel(model: string): boolean {
  return SAMPLING_MODEL_PATTERN.test(model);
}

/**
 * Token limit and sampling/reasoning options for `chat.completions.create`, valid for both
 * legacy (gpt-4o-era) and reasoning (GPT-5+/GPT-6) models.
 */
export function buildOpenAiChatOptions(
  model: string,
  options: { maxTokens: number; temperature?: number }
): OpenAiChatOptions {
  if (isOpenAiSamplingModel(model)) {
    return {
      max_completion_tokens: options.maxTokens,
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    };
  }

  return {
    max_completion_tokens: options.maxTokens + REASONING_TOKEN_HEADROOM,
    reasoning_effort: 'low',
  };
}
