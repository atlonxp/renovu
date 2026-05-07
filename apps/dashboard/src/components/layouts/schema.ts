import { LayoutPresetId } from "@novu/shared";
import * as z from "zod";

export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 256;

const containerConfigSchema = z
	.object({
		maxWidth: z.string().optional(),
		align: z.enum(["left", "center", "right"]).optional(),
		padding: z.string().optional(),
		backgroundColor: z.string().optional(),
	})
	.optional();

export const layoutSchema = z.object({
	name: z.string().min(1).max(MAX_NAME_LENGTH),
	layoutId: z.string().min(1),
	isTranslationEnabled: z.boolean().default(false),
	presetId: z.nativeEnum(LayoutPresetId).optional(),
	/** Stringified Maily JSON document, set when the user generates a layout via AI. */
	aiBody: z.string().optional(),
	/** Container preset suggested by the AI generation flow. */
	aiContainer: containerConfigSchema,
});
