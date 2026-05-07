/** biome-ignore-all lint/correctness/useUniqueElementIds: working correctly */

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
	DEFAULT_LAYOUT_PRESET_ID,
	LAYOUT_PRESETS,
	type LayoutContainerConfig,
	type LayoutPresetId,
	slugify,
} from "@novu/shared";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AiGenerateCard } from "@/components/layouts/ai-generate-card";
import { layoutSchema } from "@/components/layouts/schema";
import {
	Form,
	FormControl,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormMessage,
	FormRoot,
} from "@/components/primitives/form/form";
import { cn } from "@/utils/ui";
import { TranslationToggleSection } from "../workflow-editor/translation-toggle-section";

interface CreateLayoutFormProps {
	onSubmit: (formData: z.infer<typeof layoutSchema>) => void;
	template?: {
		name: string;
		isTranslationEnabled?: boolean;
	};
	/** When true, changing the name does not overwrite the identifier (duplicate flow). */
	disableIdentifierSlugSync?: boolean;
	/** When true, hide the preset selector (used for duplicate flow). */
	hidePresetSelector?: boolean;
}

const derivePresetName = (prompt: string): string => {
	const cleaned = prompt.replace(/[\s\n]+/g, " ").trim();
	if (!cleaned) return "AI Layout";
	const truncated = cleaned.slice(0, 60);

	return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};

const matchPresetForContainer = (
	container?: LayoutContainerConfig,
): LayoutPresetId => {
	if (!container) return DEFAULT_LAYOUT_PRESET_ID;
	const match = LAYOUT_PRESETS.find(
		(preset) =>
			preset.container?.maxWidth === container.maxWidth &&
			preset.container?.align === container.align &&
			preset.container?.padding === container.padding,
	);

	return match?.id ?? DEFAULT_LAYOUT_PRESET_ID;
};

const PresetWidthPreview = ({
	maxWidth,
	align,
}: {
	maxWidth?: string;
	align?: "left" | "center" | "right";
}) => {
	if (!maxWidth) {
		return <div className="h-1 w-full rounded-full bg-neutral-100" />;
	}

	const isPercent = maxWidth.endsWith("%");
	const widthClass = isPercent ? "w-full" : "";
	const numericWidth = isPercent ? undefined : `min(${maxWidth}, 100%)`;

	let justify: string;
	switch (align) {
		case "left":
			justify = "justify-start";
			break;
		case "right":
			justify = "justify-end";
			break;
		default:
			justify = "justify-center";
			break;
	}

	return (
		<div className={cn("flex h-1 w-full", justify)}>
			<div
				className={cn("h-full rounded-full bg-neutral-300", widthClass)}
				style={{ width: numericWidth }}
			/>
		</div>
	);
};

export function CreateLayoutForm({
	onSubmit,
	template,
	disableIdentifierSlugSync,
	hidePresetSelector,
}: CreateLayoutFormProps) {
	const form = useForm({
		resolver: standardSchemaResolver(layoutSchema),
		defaultValues: {
			name: template?.name ?? "",
			layoutId: slugify(template?.name ?? ""),
			isTranslationEnabled: template?.isTranslationEnabled ?? false,
			presetId: hidePresetSelector ? undefined : DEFAULT_LAYOUT_PRESET_ID,
			aiBody: undefined,
			aiContainer: undefined,
		},
	});

	const aiBody = form.watch("aiBody");

	return (
		<Form {...form}>
			<FormRoot
				id="create-layout"
				autoComplete="off"
				noValidate
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				{!hidePresetSelector && (
					<AiGenerateCard
						onGenerated={({ body, container, prompt }) => {
							form.setValue("aiBody", body, { shouldDirty: true });
							form.setValue("aiContainer", container, { shouldDirty: true });
							if (!form.getValues("name")) {
								const derived = derivePresetName(prompt);
								form.setValue("name", derived, { shouldDirty: true });
								if (!disableIdentifierSlugSync) {
									form.setValue("layoutId", slugify(derived));
								}
							}
							form.setValue("presetId", matchPresetForContainer(container), {
								shouldDirty: true,
							});
						}}
					/>
				)}

				{!hidePresetSelector && (
					<FormField
						control={form.control}
						name="presetId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>
									{aiBody ? "Container preset (AI-suggested)" : "Preset"}
								</FormLabel>
								<div className="grid grid-cols-2 gap-2">
									{LAYOUT_PRESETS.map((preset) => {
										const selected = field.value === preset.id;

										return (
											<button
												key={preset.id}
												type="button"
												onClick={() =>
													field.onChange(preset.id as LayoutPresetId)
												}
												className={cn(
													"flex flex-col gap-1.5 rounded-md border p-2.5 text-left text-xs transition-colors",
													selected
														? "border-primary-500 bg-primary-50/30"
														: "border-neutral-100 hover:border-neutral-200",
												)}
												aria-pressed={selected}
											>
												<span className="text-foreground-950 text-xs font-medium">
													{preset.label}
												</span>
												<span className="text-foreground-500 text-[11px] leading-tight">
													{preset.description}
												</span>
												<PresetWidthPreview
													maxWidth={preset.container?.maxWidth}
													align={preset.container?.align}
												/>
											</button>
										);
									})}
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
				)}

				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel required>Layout name</FormLabel>
							<FormControl>
								<FormInput
									{...field}
									autoFocus
									onChange={(e) => {
										field.onChange(e);

										if (!disableIdentifierSlugSync) {
											form.setValue("layoutId", slugify(e.target.value));
										}
									}}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="layoutId"
					render={({ field }) => (
						<FormItem>
							<FormLabel required>Identifier</FormLabel>
							<FormControl>
								<FormInput {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="isTranslationEnabled"
					render={({ field }) => (
						<TranslationToggleSection
							value={field.value ?? false}
							showManageLink={false}
							onChange={field.onChange}
						/>
					)}
				/>
			</FormRoot>
		</Form>
	);
}
