import type { LayoutContainerConfig } from '@novu/shared';
import { useState } from 'react';
import { RiSparkling2Fill, RiSparkling2Line } from 'react-icons/ri';
import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';
import { useGenerateLayout } from '@/hooks/use-generate-layout';
import { ROUTES } from '@/utils/routes';

const MAX_PROMPT_LENGTH = 500;

type AiGenerateCardProps = {
  onGenerated: (result: { body: string; container?: LayoutContainerConfig; prompt: string }) => void;
};

export function AiGenerateCard({ onGenerated }: AiGenerateCardProps) {
  const [prompt, setPrompt] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const { generateLayout, isPending } = useGenerateLayout({
    onSuccess: (data) => {
      setErrorMessage(null);
      setNeedsKey(false);
      onGenerated({ body: data.body, container: data.container, prompt: prompt.trim() });
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      if (code === 'OPENAI_KEY_NOT_CONFIGURED') {
        setNeedsKey(true);
        setErrorMessage('Configure an AI provider in Settings → AI to use AI generation.');

        return;
      }
      const message = extractErrorMessage(error) ?? "Couldn't generate a layout. Try a different prompt.";
      setNeedsKey(false);
      setErrorMessage(message);
    },
  });

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setErrorMessage(null);
    generateLayout({ prompt: trimmed }).catch(() => {});
  };

  return (
    <div data-testid="ai-generate-card" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <RiSparkling2Fill size={14} className="text-primary-base" />
        <span className="text-foreground-950 text-xs font-medium">Generate with AI</span>
      </div>

      <Textarea
        simple
        placeholder='e.g. "Password reset email with a clear CTA button"'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={MAX_PROMPT_LENGTH}
        disabled={isPending}
        rows={2}
        data-testid="ai-generate-prompt"
      />

      {errorMessage && (
        <div className="text-error-base text-[11px] leading-tight">
          {errorMessage}
          {needsKey && (
            <>
              {' '}
              <Link to={ROUTES.SETTINGS_AI} className="underline">
                Open settings
              </Link>
              .
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-foreground-500 text-[11px]">
          {isPending ? 'Generating layout…' : `${prompt.trim().length}/${MAX_PROMPT_LENGTH}`}
        </span>
        <Button
          type="button"
          size="2xs"
          variant="primary"
          mode="lighter"
          leadingIcon={RiSparkling2Line}
          onClick={handleGenerate}
          isLoading={isPending}
          disabled={isPending || prompt.trim().length === 0}
          data-testid="ai-generate-submit"
        >
          Generate
        </Button>
      </div>
    </div>
  );
}

function extractErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const anyErr = error as {
    code?: unknown;
    response?: { data?: { code?: unknown } };
    cause?: { code?: unknown };
  };
  if (typeof anyErr.code === 'string') return anyErr.code;
  if (typeof anyErr.response?.data?.code === 'string') return anyErr.response.data.code;
  if (typeof anyErr.cause?.code === 'string') return anyErr.cause.code;

  return undefined;
}

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const anyErr = error as { message?: unknown; response?: { data?: { message?: unknown } } };
  if (typeof anyErr.response?.data?.message === 'string') return anyErr.response.data.message;
  if (typeof anyErr.message === 'string') return anyErr.message;

  return undefined;
}
