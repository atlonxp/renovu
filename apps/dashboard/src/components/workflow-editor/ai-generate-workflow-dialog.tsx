import { slugify, StepTypeEnum, WorkflowCreationSourceEnum } from '@novu/shared';
import { useState } from 'react';
import { RiSparkling2Fill, RiSparkling2Line } from 'react-icons/ri';
import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Textarea } from '@/components/primitives/textarea';
import { useCreateWorkflow } from '@/hooks/use-create-workflow';
import { useGenerateWorkflow } from '@/hooks/use-generate-workflow';
import { ROUTES } from '@/utils/routes';
import { cn } from '@/utils/ui';

const MAX_PROMPT_LENGTH = 500;

const CHANNEL_OPTIONS: { type: StepTypeEnum; label: string }[] = [
  { type: StepTypeEnum.IN_APP, label: 'In-app' },
  { type: StepTypeEnum.EMAIL, label: 'Email' },
  { type: StepTypeEnum.PUSH, label: 'Push' },
  { type: StepTypeEnum.SMS, label: 'SMS' },
  { type: StepTypeEnum.CHAT, label: 'Chat' },
];

const ACTION_OPTIONS: { type: StepTypeEnum; label: string }[] = [
  { type: StepTypeEnum.DELAY, label: 'Delay' },
  { type: StepTypeEnum.DIGEST, label: 'Digest' },
  { type: StepTypeEnum.THROTTLE, label: 'Throttle' },
];

const DEFAULT_CHECKED = new Set<StepTypeEnum>([StepTypeEnum.IN_APP, StepTypeEnum.EMAIL]);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AiGenerateWorkflowDialog({ open, onOpenChange }: Props) {
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState<Set<StepTypeEnum>>(new Set(DEFAULT_CHECKED));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const { generateWorkflow, isPending: isGenerating } = useGenerateWorkflow({
    onError: (error: unknown) => {
      const code = extractErrorCode(error);
      if (code === 'OPENAI_KEY_NOT_CONFIGURED') {
        setNeedsKey(true);
        setErrorMessage('Configure an AI provider in Settings → AI to use AI generation.');

        return;
      }
      const message = extractErrorMessage(error) ?? "Couldn't generate a workflow. Try a different prompt.";
      setNeedsKey(false);
      setErrorMessage(message);
    },
  });

  const { submit: createWorkflow, isLoading: isCreating } = useCreateWorkflow({
    onSuccess: () => {
      onOpenChange(false);
      reset();
    },
  });

  const isPending = isGenerating || isCreating;

  const reset = () => {
    setPrompt('');
    setSelected(new Set(DEFAULT_CHECKED));
    setErrorMessage(null);
    setNeedsKey(false);
  };

  const toggle = (type: StepTypeEnum) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);

      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setErrorMessage(null);

    try {
      const result = await generateWorkflow({
        prompt: trimmed,
        channels: selected.size > 0 ? Array.from(selected) : undefined,
      });

      const slug = slugify(result.name);
      await createWorkflow(
        {
          name: result.name,
          workflowId: slug,
          description: result.description ?? '',
          tags: result.tags ?? [],
          isTranslationEnabled: false,
        },
        {
          name: result.name,
          tags: result.tags ?? [],
          description: result.description,
          steps: result.steps.map((s) => ({
            name: s.name,
            type: s.type,
            controlValues: s.controlValues ?? null,
          })),
          __source: WorkflowCreationSourceEnum.DASHBOARD,
          workflowId: slug,
        }
      );
    } catch {
      // surfaced via hooks
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="w-[520px] max-w-[520px] p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary-base text-static-white flex size-8 items-center justify-center rounded-md">
              <RiSparkling2Fill size={18} />
            </span>
            <div className="flex flex-col">
              <DialogTitle className="text-foreground-950 text-sm font-semibold">Generate workflow with AI</DialogTitle>
              <DialogDescription className="text-foreground-600 text-[11px] leading-tight">
                Describe a notification flow; we&apos;ll draft the steps and create it.
              </DialogDescription>
            </div>
          </div>

          <Textarea
            simple
            placeholder='e.g. "Welcome new users with an in-app message and an email"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={MAX_PROMPT_LENGTH}
            disabled={isPending}
            rows={3}
            data-testid="ai-generate-workflow-dialog-prompt"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-foreground-600 text-[11px] font-medium uppercase">Channels</span>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((opt) => (
                <ChannelChip
                  key={opt.type}
                  label={opt.label}
                  type={opt.type}
                  checked={selected.has(opt.type)}
                  disabled={isPending}
                  onToggle={() => toggle(opt.type)}
                />
              ))}
            </div>
            <span className="text-foreground-600 text-[11px] font-medium uppercase mt-1">Actions</span>
            <div className="flex flex-wrap gap-2">
              {ACTION_OPTIONS.map((opt) => (
                <ChannelChip
                  key={opt.type}
                  label={opt.label}
                  type={opt.type}
                  checked={selected.has(opt.type)}
                  disabled={isPending}
                  onToggle={() => toggle(opt.type)}
                />
              ))}
            </div>
          </div>

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
              {isGenerating
                ? 'Generating workflow…'
                : isCreating
                  ? 'Creating workflow…'
                  : `${prompt.trim().length}/${MAX_PROMPT_LENGTH}`}
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
              data-testid="ai-generate-workflow-dialog-submit"
            >
              Generate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelChip({
  label,
  type,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  type: StepTypeEnum;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
        checked ? 'border-primary-500 bg-primary-50/50 text-primary-700' : 'border-neutral-200 bg-bg-white text-foreground-700',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      data-testid={`ai-generate-workflow-dialog-channel-${type}`}
    >
      <Checkbox checked={checked} onCheckedChange={() => !disabled && onToggle()} disabled={disabled} />
      {label}
    </label>
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
