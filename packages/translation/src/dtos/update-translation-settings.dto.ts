import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString, Matches } from "class-validator";

/**
 * DTO for updating translation settings
 *
 * All fields are optional to support partial updates.
 *
 * Note: API key + model live in `AiSettings` (Settings → AI). They are no
 * longer part of this DTO.
 *
 * @example
 * ```typescript
 * // Update locales
 * {
 *   defaultLocale: 'en_US',
 *   targetLocales: ['es_ES', 'fr_FR', 'de_DE']
 * }
 * ```
 */
export class UpdateTranslationSettingsDto {
	@ApiPropertyOptional({
		description: "Default source locale (BCP-47 format with underscore)",
		example: "en_US",
	})
	@IsOptional()
	@IsString()
	@Matches(/^[a-z]{2}_[A-Z]{2}$/, {
		message: "Locale must be in format: xx_XX (e.g., en_US, es_ES)",
	})
	defaultLocale?: string;

	@ApiPropertyOptional({
		description: "Target locales for translation",
		type: [String],
		example: ["es_ES", "fr_FR", "de_DE"],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Matches(/^[a-z]{2}_[A-Z]{2}$/, {
		each: true,
		message: "Each locale must be in format: xx_XX (e.g., en_US, es_ES)",
	})
	targetLocales?: string[];

	@ApiPropertyOptional({
		description: "Custom locale aliases (e.g., { 'zh-hans': 'zh_CN' })",
		example: { "zh-hans": "zh_CN" },
	})
	@IsOptional()
	@IsObject()
	localeAliases?: Record<string, string>;
}
