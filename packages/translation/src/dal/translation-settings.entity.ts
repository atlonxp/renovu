import type { Types } from "mongoose";

/**
 * Type helper for changing property value types in an entity
 * Used to convert string IDs to ObjectIds in the DB model
 * Defined locally to avoid dependency on @novu/dal
 */
type ChangePropsValueType<T, K extends keyof T, V = Types.ObjectId> = Omit<
	T,
	K
> & {
	[P in K]: V;
};

/**
 * Supported OpenAI models for translation.
 *
 * Kept in this package for back-compat with code that imports it from
 * `@novu/translation`. The canonical source for the configured model is now
 * `AiSettings.model` in apps/api.
 */
export enum OpenAIModelEnum {
	GPT_4O_MINI = "gpt-4o-mini",
	GPT_4O = "gpt-4o",
	GPT_4_TURBO = "gpt-4-turbo",
}

/**
 * Translation settings entity for storing organization-level translation configuration.
 *
 * Note: API key + model live in `AiSettings` (apps/api/src/app/ai-settings).
 * This entity only holds locale-related fields.
 */
export class TranslationSettingsEntity {
	_id: string;

	_organizationId: string;

	/**
	 * Default source locale for translations
	 * BCP-47 language tag (e.g., "en_US", "en_GB")
	 */
	defaultLocale: string;

	/**
	 * Target locales for translation
	 * Array of BCP-47 language tags (e.g., ["es_ES", "fr_FR", "de_DE"])
	 */
	targetLocales: string[];

	/**
	 * Custom locale aliases for mapping external locale codes to internal ones
	 * Allows integration with systems that use different locale formats
	 * Example: { "zh-hans": "zh_CN", "zh-hant": "zh_TW", "chinese": "zh_CN" }
	 */
	localeAliases?: Record<string, string>;

	createdAt: string;

	updatedAt: string;
}

export type TranslationSettingsDBModel = ChangePropsValueType<
	TranslationSettingsEntity,
	"_organizationId"
>;
