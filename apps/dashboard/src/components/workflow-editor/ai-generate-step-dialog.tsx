import { type StepCreateDto, StepTypeEnum } from "@novu/shared";
import { useState } from "react";
import { RiSparkling2Fill, RiSparkling2Line } from "react-icons/ri";
import { Link } from "react-router-dom";
import { Button } from "@/components/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/primitives/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/primitives/select";
import { Textarea } from "@/components/primitives/textarea";
import { useGenerateWorkflowStep } from "@/hooks/use-generate-workflow";
import { ROUTES } from "@/utils/routes";

const MAX_PROMPT_LENGTH = 500;

const STEP_TYPE_OPTIONS: { type: StepTypeEnum; label: string }[] = [
	{ type: StepTypeEnum.IN_APP, label: "In-app" },
	{ type: StepTypeEnum.EMAIL, label: "Email" },
	{ type: StepTypeEnum.PUSH, label: "Push" },
	{ type: StepTypeEnum.SMS, label: "SMS" },
	{ type: StepTypeEnum.CHAT, label: "Chat" },
	{ type: StepTypeEnum.DELAY, label: "Delay" },
	{ type: StepTypeEnum.DIGEST, label: "Digest" },
	{ type: StepTypeEnum.THROTTLE, label: "Throttle" },
];

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called when AI returns a valid step. Parent inserts it into the canvas. */
	onGenerated: (step: StepCreateDto) => void;
	/** Pre-selected step type (when AI was triggered from a typed slot). */
	defaultType?: StepTypeEnum;
};

export function AiGenerateStepDialog({
	open,
	onOpenChange,
	onGenerated,
	defaultType,
}: Props) {
	const [prompt, setPrompt] = useState("");
	const [type, setType] = useState<StepTypeEnum>(
		defaultType ?? StepTypeEnum.IN_APP,
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [needsKey, setNeedsKey] = useState(false);

	const { generateWorkflowStep, isPending } = useGenerateWorkflowStep({
		onError: (error: unknown) => {
			const code = extractErrorCode(error);
			if (code === "OPENAI_KEY_NOT_CONFIGURED") {
				setNeedsKey(true);
				setErrorMessage(
					"Configure an AI provider in Settings → AI to use AI generation.",
				);

				return;
			}
			const message =
				extractErrorMessage(error) ??
				"Couldn't generate a step. Try a different prompt.";
			setNeedsKey(false);
			setErrorMessage(message);
		},
	});

	const reset = () => {
		setPrompt("");
		setErrorMessage(null);
		setNeedsKey(false);
	};

	const handleSubmit = async () => {
		const trimmed = prompt.trim();
		if (!trimmed) return;
		setErrorMessage(null);

		try {
			const result = await generateWorkflowStep({ prompt: trimmed, type });
			onGenerated({
				name: result.name,
				type: result.type,
				controlValues: result.controlValues ?? null,
			});
			reset();
			onOpenChange(false);
		} catch {
			// error already surfaced
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				onOpenChange(o);
				if (!o) reset();
			}}
		>
			<DialogContent className="w-[480px] max-w-[480px] p-0">
				<div className="flex flex-col gap-3 p-4">
					<div className="flex items-center gap-2">
						<span className="bg-primary-base text-static-white flex size-8 items-center justify-center rounded-md">
							<RiSparkling2Fill size={18} />
						</span>
						<div className="flex flex-col">
							<DialogTitle className="text-foreground-950 text-sm font-semibold">
								Generate step with AI
							</DialogTitle>
							<DialogDescription className="text-foreground-600 text-[11px] leading-tight">
								Describe what this step should do; we&apos;ll fill in the
								controls.
							</DialogDescription>
						</div>
					</div>

					<div className="flex flex-col gap-1.5">
						<span className="text-foreground-600 text-[11px] font-medium uppercase">
							Step type
						</span>
						<Select
							value={type}
							onValueChange={(v) => setType(v as StepTypeEnum)}
							disabled={isPending}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STEP_TYPE_OPTIONS.map((opt) => (
									<SelectItem key={opt.type} value={opt.type}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<Textarea
						simple
						placeholder='e.g. "Notify the user that their report is ready, with a link to download"'
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						maxLength={MAX_PROMPT_LENGTH}
						disabled={isPending}
						rows={4}
						data-testid="ai-generate-step-prompt"
					/>

					{errorMessage && (
						<div className="text-error-base text-[11px] leading-tight">
							{errorMessage}
							{needsKey && (
								<>
									{" "}
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
							{isPending
								? "Generating step…"
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
							data-testid="ai-generate-step-submit"
						>
							Generate step
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function extractErrorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const anyErr = error as {
		code?: unknown;
		response?: { data?: { code?: unknown } };
	};
	if (typeof anyErr.code === "string") return anyErr.code;
	if (typeof anyErr.response?.data?.code === "string")
		return anyErr.response.data.code;

	return undefined;
}

function extractErrorMessage(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const anyErr = error as {
		message?: unknown;
		response?: { data?: { message?: unknown } };
	};
	if (typeof anyErr.response?.data?.message === "string")
		return anyErr.response.data.message;
	if (typeof anyErr.message === "string") return anyErr.message;

	return undefined;
}
