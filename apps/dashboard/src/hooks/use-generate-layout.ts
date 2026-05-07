import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { type GenerateLayoutResponse, generateLayout } from "@/api/layouts";
import { useEnvironment } from "@/context/environment/hooks";

type GenerateLayoutVariables = {
	prompt: string;
};

export function useGenerateLayout(
	options?: UseMutationOptions<
		GenerateLayoutResponse,
		unknown,
		GenerateLayoutVariables
	>,
) {
	const { currentEnvironment } = useEnvironment();

	const mutation = useMutation({
		mutationFn: async ({ prompt }: GenerateLayoutVariables) =>
			generateLayout({ environment: currentEnvironment!, prompt }),
		...options,
	});

	return {
		generateLayout: mutation.mutateAsync,
		isPending: mutation.isPending,
		error: mutation.error,
		reset: mutation.reset,
	};
}
