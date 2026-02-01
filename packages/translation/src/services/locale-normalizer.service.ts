import { Injectable } from "@nestjs/common";

/**
 * Built-in locale mappings for common format conversions
 * Maps various locale formats to POSIX-style (language_REGION)
 */
const BUILT_IN_LOCALE_MAPPINGS: Record<string, string> = {
	// Chinese variants
	"zh-hans": "zh_CN", // Simplified Chinese
	"zh-hant": "zh_TW", // Traditional Chinese
	"zh-cn": "zh_CN",
	"zh-tw": "zh_TW",
	"zh-hk": "zh_HK",
	"zh-sg": "zh_SG",
	"zh": "zh_CN", // Default Chinese to Simplified

	// English variants
	"en-us": "en_US",
	"en-gb": "en_GB",
	"en-au": "en_AU",
	"en-ca": "en_CA",
	"en": "en_US", // Default English to US

	// Japanese
	"ja-jp": "ja_JP",
	"ja": "ja_JP",

	// Korean
	"ko-kr": "ko_KR",
	"ko": "ko_KR",

	// Thai
	"th-th": "th_TH",
	"th": "th_TH",

	// Spanish variants
	"es-es": "es_ES",
	"es-mx": "es_MX",
	"es-ar": "es_AR",
	"es": "es_ES",

	// French variants
	"fr-fr": "fr_FR",
	"fr-ca": "fr_CA",
	"fr": "fr_FR",

	// German variants
	"de-de": "de_DE",
	"de-at": "de_AT",
	"de-ch": "de_CH",
	"de": "de_DE",

	// Portuguese variants
	"pt-br": "pt_BR",
	"pt-pt": "pt_PT",
	"pt": "pt_BR",

	// Italian
	"it-it": "it_IT",
	"it": "it_IT",

	// Russian
	"ru-ru": "ru_RU",
	"ru": "ru_RU",

	// Arabic variants
	"ar-sa": "ar_SA",
	"ar-ae": "ar_AE",
	"ar-eg": "ar_EG",
	"ar": "ar_SA",

	// Hindi
	"hi-in": "hi_IN",
	"hi": "hi_IN",

	// Indonesian
	"id-id": "id_ID",
	"id": "id_ID",

	// Vietnamese
	"vi-vn": "vi_VN",
	"vi": "vi_VN",

	// Dutch
	"nl-nl": "nl_NL",
	"nl-be": "nl_BE",
	"nl": "nl_NL",

	// Polish
	"pl-pl": "pl_PL",
	"pl": "pl_PL",

	// Turkish
	"tr-tr": "tr_TR",
	"tr": "tr_TR",

	// Swedish
	"sv-se": "sv_SE",
	"sv": "sv_SE",

	// Norwegian
	"nb-no": "nb_NO",
	"nn-no": "nn_NO",
	"no": "nb_NO",

	// Danish
	"da-dk": "da_DK",
	"da": "da_DK",

	// Finnish
	"fi-fi": "fi_FI",
	"fi": "fi_FI",

	// Czech
	"cs-cz": "cs_CZ",
	"cs": "cs_CZ",

	// Hungarian
	"hu-hu": "hu_HU",
	"hu": "hu_HU",

	// Greek
	"el-gr": "el_GR",
	"el": "el_GR",

	// Hebrew
	"he-il": "he_IL",
	"he": "he_IL",
	"iw": "he_IL", // Legacy code

	// Ukrainian
	"uk-ua": "uk_UA",
	"uk": "uk_UA",

	// Romanian
	"ro-ro": "ro_RO",
	"ro": "ro_RO",

	// Malay
	"ms-my": "ms_MY",
	"ms": "ms_MY",

	// Filipino/Tagalog
	"fil-ph": "fil_PH",
	"tl": "fil_PH",
	"fil": "fil_PH",
};

/**
 * LocaleNormalizerService
 *
 * Normalizes locale codes from various formats to POSIX-style (language_REGION).
 * Supports built-in mappings for common formats and custom organization-level aliases.
 *
 * Priority order for normalization:
 * 1. Custom aliases (organization-specific)
 * 2. Built-in mappings (common format conversions)
 * 3. Format normalization (hyphen to underscore, case fixing)
 * 4. Original value (if already in correct format)
 *
 * @example
 * ```typescript
 * const normalizer = new LocaleNormalizerService();
 *
 * // Built-in mappings
 * normalizer.normalize('zh-hans') // => 'zh_CN'
 * normalizer.normalize('en-US')   // => 'en_US'
 * normalizer.normalize('ja')      // => 'ja_JP'
 *
 * // With custom aliases
 * normalizer.normalize('chinese', { 'chinese': 'zh_CN' }) // => 'zh_CN'
 * ```
 */
@Injectable()
export class LocaleNormalizerService {
	/**
	 * Normalize a locale code to POSIX format (language_REGION)
	 *
	 * @param locale - The input locale code in any format
	 * @param customAliases - Optional organization-specific locale aliases
	 * @returns Normalized locale code in POSIX format
	 */
	normalize(locale: string, customAliases?: Record<string, string>): string {
		if (!locale) {
			return locale;
		}

		const lowerLocale = locale.toLowerCase().trim();

		// 1. Check custom aliases first (highest priority)
		if (customAliases) {
			// Check exact match (case-insensitive)
			for (const [alias, target] of Object.entries(customAliases)) {
				if (alias.toLowerCase() === lowerLocale) {
					return target;
				}
			}
		}

		// 2. Check built-in mappings
		if (BUILT_IN_LOCALE_MAPPINGS[lowerLocale]) {
			return BUILT_IN_LOCALE_MAPPINGS[lowerLocale];
		}

		// 3. Try format normalization (convert hyphen to underscore, fix case)
		const normalized = this.normalizeFormat(locale);

		// 4. Check if normalized version is in built-in mappings
		if (BUILT_IN_LOCALE_MAPPINGS[normalized.toLowerCase()]) {
			return BUILT_IN_LOCALE_MAPPINGS[normalized.toLowerCase()];
		}

		// 5. Return normalized format or original
		return normalized;
	}

	/**
	 * Normalize locale format to POSIX style
	 * Converts "en-US" or "en-us" to "en_US"
	 */
	private normalizeFormat(locale: string): string {
		// Handle various separators: hyphen, underscore, or none
		const parts = locale.split(/[-_]/);

		if (parts.length === 1) {
			// Just language code, return as-is (lowercase)
			return parts[0].toLowerCase();
		}

		if (parts.length === 2) {
			// language-REGION format
			const language = parts[0].toLowerCase();
			const region = parts[1].toUpperCase();

			return `${language}_${region}`;
		}

		// Complex format (e.g., zh-Hans-CN), try to extract language and region
		if (parts.length >= 3) {
			const language = parts[0].toLowerCase();
			const region = parts[parts.length - 1].toUpperCase();

			return `${language}_${region}`;
		}

		return locale;
	}

	/**
	 * Check if a locale is valid/supported
	 *
	 * @param locale - The locale to check
	 * @param supportedLocales - List of supported locales in the system
	 * @param customAliases - Optional custom aliases
	 * @returns True if the locale (or its normalized form) is supported
	 */
	isSupported(
		locale: string,
		supportedLocales: string[],
		customAliases?: Record<string, string>,
	): boolean {
		const normalized = this.normalize(locale, customAliases);

		return supportedLocales.includes(normalized);
	}

	/**
	 * Get the normalized locale if supported, otherwise return the fallback
	 *
	 * @param locale - The input locale
	 * @param supportedLocales - List of supported locales
	 * @param fallbackLocale - Fallback locale if not supported
	 * @param customAliases - Optional custom aliases
	 * @returns The normalized locale or fallback
	 */
	normalizeOrFallback(
		locale: string,
		supportedLocales: string[],
		fallbackLocale: string,
		customAliases?: Record<string, string>,
	): string {
		const normalized = this.normalize(locale, customAliases);

		if (supportedLocales.includes(normalized)) {
			return normalized;
		}

		return fallbackLocale;
	}

	/**
	 * Get all built-in mappings (for documentation/debugging)
	 */
	getBuiltInMappings(): Record<string, string> {
		return { ...BUILT_IN_LOCALE_MAPPINGS };
	}
}
