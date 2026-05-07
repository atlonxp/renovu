import { useState } from 'react';
import { RiSparkling2Fill, RiSparkling2Line } from 'react-icons/ri';
import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Textarea } from '@/components/primitives/textarea';
import { useGenerateLayout } from '@/hooks/use-generate-layout';
import { useLayoutEditor } from './layout-editor-provider';
import { ROUTES } from '@/utils/routes';

const MAX_PROMPT_LENGTH = 500;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AiRegenerateLayoutDialog({ open, onOpenChange }: Props) {
  const { form } = useLayoutEditor();
  const [prompt, setPrompt] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const { generateLayout, isPending } = useGenerateLayout({
    onSuccess: (data) => {
      // Replace the body and container in the editor form. The user still has to
      // press the existing Save button to persist — keeps regen reversible (Cmd-Z).
      form.setValue('body', data.body, { shouldDirty: true });
      if (data.container) form.setValue('container', data.container, { shouldDirty: true });
      onOpenChange(false);
      setPrompt('');
      setErrorMessage(null);
      setNeedsKey(false);
    },
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      if (code === 'OPENAI_KEY_NOT_CONFIGURED') {
        setNeedsKey(true);
        setErrorMessage('Configure an AI provider in Settings → AI to use AI generation.');

        return;
      }
      const message = extractErrorMessage(error) ?? "Couldn't regenerate the layout. Try a different prompt.";
      setNeedsKey(false);
      setErrorMessage(message);
    },
  });

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setErrorMessage(null);
    generateLayout({ prompt: trimmed }).catch(() => {});
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="w-[480px] max-w-[480px] p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary-base text-static-white flex size-8 items-center justify-center rounded-md">
              <RiSparkling2Fill size={18} />
            </span>
            <div className="flex flex-col">
              <DialogTitle className="text-foreground-950 text-sm font-semibold">Regenerate with AI</DialogTitle>
              <DialogDescription className="text-foreground-600 text-[11px] leading-tight">
                Describe a new email; we&apos;ll replace the current body and container. Save to persist.
              </DialogDescription>
            </div>
          </div>

          <Textarea
            simple
            placeholder='e.g. "Make the hero bolder and add a CTA button to upgrade"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={MAX_PROMPT_LENGTH}
            disabled={isPending}
            rows={4}
            data-testid="ai-regenerate-layout-prompt"
            autoFocus
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
              size="xs"
              variant="primary"
              mode="filled"
              leadingIcon={RiSparkling2Line}
              onClick={handleSubmit}
              isLoading={isPending}
              disabled={isPending || prompt.trim().length === 0}
              data-testid="ai-regenerate-layout-submit"
            >
              Replace body
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function extractErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const anyErr = error as {
    code?: unknown;
    response?: { data?: { code?: unknown } };
  };
  if (typeof anyErr.code === 'string') return anyErr.code;
  if (typeof anyErr.response?.data?.code === 'string') return anyErr.response.data.code;

  return undefined;
}

function extractErrorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const anyErr = error as { message?: unknown; response?: { data?: { message?: unknown } } };
  if (typeof anyErr.response?.data?.message === 'string') return anyErr.response.data.message;
  if (typeof anyErr.message === 'string') return anyErr.message;

  return undefined;
}
