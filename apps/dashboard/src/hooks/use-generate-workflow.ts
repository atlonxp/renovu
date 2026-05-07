import type { StepTypeEnum } from "@novu/shared";
import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import {
	type GenerateWorkflowResponse,
	type GenerateWorkflowStepResponse,
	generateWorkflow,
	generateWorkflowStep,
} from "@/api/workflows";
import { useEnvironment } from "@/context/environment/hooks";

type GenerateWorkflowVariables = {
	prompt: string;
	channels?: StepTypeEnum[];
};

type GenerateStepVariables = {
	prompt: string;
	type: StepTypeEnum;
};

export function useGenerateWorkflow(
	options?: UseMutationOptions<
		GenerateWorkflowResponse,
		unknown,
		GenerateWorkflowVariables
	>,
) {
	const { currentEnvironment } = useEnvironment();

	const mutation = useMutation({
		mutationFn: async ({ prompt, channels }: GenerateWorkflowVariables) =>
			generateWorkflow({ environment: currentEnvironment!, prompt, channels }),
		...options,
	});

	return {
		generateWorkflow: mutation.mutateAsync,
		isPending: mutation.isPending,
		error: mutation.error,
		reset: mutation.reset,
	};
}

export function useGenerateWorkflowStep(
	options?: UseMutationOptions<
		GenerateWorkflowStepResponse,
		unknown,
		GenerateStepVariables
	>,
) {
	const { currentEnvironment } = useEnvironment();

	const mutation = useMutation({
		mutationFn: async ({ prompt, type }: GenerateStepVariables) =>
			generateWorkflowStep({ environment: currentEnvironment!, prompt, type }),
		...options,
	});

	return {
		generateWorkflowStep: mutation.mutateAsync,
		isPending: mutation.isPending,
		error: mutation.error,
		reset: mutation.reset,
	};
}
