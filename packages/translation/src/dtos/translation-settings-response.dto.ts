import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Response DTO for translation settings
 *
 * Note: API key + model live in `AiSettings` (Settings → AI) and are returned
 * by `/v1/ai-settings`, not here.
 */
export class TranslationSettingsResponseDto {
	@ApiProperty({
		description: "Unique identifier for the translation settings",
		example: "507f1f77bcf86cd799439011",
	})
	_id: string;

	@ApiProperty({
		description: "Organization ID these settings belong to",
		example: "507f1f77bcf86cd799439012",
	})
	_organizationId: string;

	@ApiProperty({
		description: "Default source locale (BCP-47 format)",
		example: "en_US",
	})
	defaultLocale: string;

	@ApiProperty({
		description: "Target locales for translation",
		type: [String],
		example: ["es_ES", "fr_FR", "de_DE"],
	})
	targetLocales: string[];

	@ApiPropertyOptional({
		description: "Custom locale aliases",
		example: { "zh-hans": "zh_CN" },
	})
	localeAliases?: Record<string, string>;

	@ApiProperty({
		description: "When the settings were created",
		example: "2024-01-15T10:30:00.000Z",
	})
	createdAt: string;

	@ApiProperty({
		description: "When the settings were last updated",
		example: "2024-01-15T10:30:00.000Z",
	})
	updatedAt: string;
}
