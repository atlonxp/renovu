import { Inject, Injectable, Logger } from "@nestjs/common";
import { AI_SETTINGS_REPOSITORY, type IAiSettingsLookup } from "@novu/application-generic";
import {
	ControlValuesRepository,
	LocalizationResourceEnum as DalLocalizationResourceEnum,
	type LocalizationGroupEntity,
	LocalizationGroupRepository,
	LocalizationRepository,
} from "@novu/dal";
import { ControlValuesLevelEnum } from "@novu/shared";

import { TranslationSettingsRepository } from "../../dal";
import { ContentExtractorService } from "../../services";
import {
	LocalizationResourceEnum,
	type ManageTranslationsCommand,
} from "./manage-translations.command";

/**
 * Result of managing translations on a resource
 */
export interface ManageTranslationsResult {
	/**
	 * Whether the operation was successful
	 */
	success: boolean;

	/**
	 * Current enabled state after operation
	 */
	enabled: boolean;

	/**
	 * The LocalizationGroup entity (null if disabled)
	 */
	localizationGroup?: LocalizationGroupEntity;

	/**
	 * Whether auto-translate should be triggered
	 * True when translations are enabled for the first time
	 */
	shouldAutoTranslate: boolean;

	/**
	 * Extracted content from the source resource (only when shouldAutoTranslate is true)
	 * Key format: 'step.<stepId>.<field>'
	 */
	extractedContent?: Record<string, string>;

	/**
	 * Message describing the operation result
	 */
	message: string;
}

/**
 * ManageTranslations Usecase
 *
 * Enables or disables translation management for resources (workflows/layouts).
 *
 * When enabled:
 * - Creates a LocalizationGroup for the resource if it doesn't exist
 * - Reuses existing group if already created (soft-enable)
 * - Signals that auto-translation should be queued (for Phase 7)
 *
 * When disabled:
 * - Soft-disables by not deleting data
 * - Translation data is preserved for potential re-enable
 * - The group remains but can be filtered out in queries
 *
 * @example
 * ```typescript
 * // Enable translations for a workflow
 * const result = await manageTranslations.execute(
 *   ManageTranslationsCommand.create({
 *     enabled: true,
 *     resourceId: 'welcome-email-workflow',
 *     resourceInternalId: '60d5ec9f1c9d440000a1b2c3',
 *     resourceName: 'Welcome Email Workflow',
 *     resourceType: LocalizationResourceEnum.WORKFLOW,
 *     organizationId: 'org_123',
 *     environmentId: 'env_456',
 *     userId: 'user_789',
 *   })
 * );
 *
 * if (result.shouldAutoTranslate) {
 *   // Queue auto-translate job (Phase 7)
 * }
 * ```
 */
@Injectable()
export class ManageTranslations {
	private readonly logger = new Logger(ManageTranslations.name);

	constructor(
		private readonly localizationGroupRepository: LocalizationGroupRepository,
		private readonly localizationRepository: LocalizationRepository,
		private readonly settingsRepository: TranslationSettingsRepository,
		@Inject(AI_SETTINGS_REPOSITORY)
		private readonly aiSettingsRepository: IAiSettingsLookup,
		private readonly contentExtractor: ContentExtractorService,
		private readonly controlValuesRepository: ControlValuesRepository,
	) {}

	/**
	 * Execute the manage translations command
	 *
	 * @param command - The command containing enable/disable instructions
	 * @returns Result with success status, group entity, and auto-translate flag
	 */
	async execute(
		command: ManageTranslationsCommand,
	): Promise<ManageTranslationsResult> {
		const {
			enabled,
			resourceId,
			resourceInternalId,
			resourceName,
			resourceType,
			organizationId,
			environmentId,
			session,
			resourceEntity,
		} = command;

		// Validate required fields for enable operation
		if (enabled && !resourceInternalId) {
			throw new Error(
				"resourceInternalId is required when enabling translations",
			);
		}

		// Convert to DAL enum
		const dalResourceType = this.convertToDalResourceType(resourceType);

		if (enabled) {
			return this.enableTranslations(
				resourceId,
				resourceInternalId!,
				resourceName || resourceId,
				dalResourceType,
				organizationId,
				environmentId,
				session,
				resourceEntity,
			);
		} else {
			return this.disableTranslations(
				resourceId,
				resourceInternalId,
				dalResourceType,
				organizationId,
				environmentId,
			);
		}
	}

	/**
	 * Enable translations for a resource
	 */
	private async enableTranslations(
		resourceId: string,
		resourceInternalId: string,
		resourceName: string,
		resourceType: DalLocalizationResourceEnum,
		organizationId: string,
		environmentId: string,
		session?: any,
		resourceEntity?: Record<string, unknown>,
	): Promise<ManageTranslationsResult> {
		// Check if group already exists
		const existingGroup = await this.localizationGroupRepository.findByResource(
			resourceType,
			resourceInternalId,
			environmentId,
			organizationId,
		);

		if (existingGroup) {
			// Group exists - re-enable by setting enabled=true
			// This handles the case where the group was previously soft-disabled
			if (existingGroup.enabled === false) {
				this.logger.log(
					`Re-enabling translations for ${resourceType}:${resourceId} (group: ${existingGroup._id})`,
				);
				await this.localizationGroupRepository.setEnabled(
					resourceType,
					resourceInternalId,
					environmentId,
					organizationId,
					true,
				);
			} else {
				this.logger.log(
					`Translations already enabled for ${resourceType}:${resourceId} (group: ${existingGroup._id})`,
				);
			}

			// Update source content if resource entity is provided
			let extractedContent: Record<string, string> = {};
			if (resourceEntity) {
				extractedContent = await this.extractAndStoreSourceContent(
					existingGroup._id,
					organizationId,
					environmentId,
					resourceEntity,
					session,
				);
			}

			// Check if target locales need translation (trigger if no translations exist yet)
			const shouldAutoTranslate = await this.shouldTriggerAutoTranslate(
				existingGroup._id,
				organizationId,
				environmentId,
				extractedContent,
			);

			return {
				success: true,
				enabled: true,
				localizationGroup: existingGroup,
				shouldAutoTranslate,
				extractedContent: shouldAutoTranslate && Object.keys(extractedContent).length > 0 ? extractedContent : undefined,
				message: `Translations re-enabled for ${resourceType} "${resourceName}"`,
			};
		}

		// Create new LocalizationGroup
		const localizationGroup =
			await this.localizationGroupRepository.getOrCreateForResource(
				resourceType,
				resourceId,
				resourceName,
				resourceInternalId,
				environmentId,
				organizationId,
				session,
			);

		this.logger.log(
			`Created LocalizationGroup ${localizationGroup?._id} for ${resourceType}:${resourceId}`,
		);

		// Extract and store source content if resource entity is provided
		let extractedContent: Record<string, string> = {};
		if (localizationGroup && resourceEntity) {
			extractedContent = await this.extractAndStoreSourceContent(
				localizationGroup._id,
				organizationId,
				environmentId,
				resourceEntity,
				session,
			);
		}

		return {
			success: true,
			enabled: true,
			localizationGroup: localizationGroup || undefined,
			shouldAutoTranslate: true, // First-time enable triggers auto-translate
			extractedContent: Object.keys(extractedContent).length > 0 ? extractedContent : undefined,
			message: `Translations enabled for ${resourceType} "${resourceName}"`,
		};
	}

	/**
	 * Extract translatable content from resource entity and store in default locale
	 * @returns The extracted content for auto-translation
	 */
	private async extractAndStoreSourceContent(
		localizationGroupId: string,
		organizationId: string,
		environmentId: string,
		resourceEntity: Record<string, unknown>,
		session?: any,
	): Promise<Record<string, string>> {
		// Get organization settings to determine default locale
		const settings =
			await this.settingsRepository.findByOrganization(organizationId);
		const defaultLocale = settings?.defaultLocale || "en_US";

		// First try to extract content from the workflow entity (V1 workflows)
		let extractedContent =
			this.contentExtractor.extractFromWorkflow(resourceEntity);

		// If no content found and we have a workflow ID, try fetching control values (V2 workflows)
		const workflowId = resourceEntity._id as string | undefined;
		if (Object.keys(extractedContent).length === 0 && workflowId) {
			this.logger.log(
				`No content in workflow entity, fetching control values for workflow ${workflowId}`,
			);
			extractedContent = await this.extractFromControlValues(
				workflowId,
				organizationId,
				environmentId,
				resourceEntity,
			);
		}

		if (Object.keys(extractedContent).length === 0) {
			this.logger.debug(
				`No translatable content found for localization group ${localizationGroupId}`,
			);
			return {};
		}

		// Serialize content to JSON string for storage
		const serializedContent = JSON.stringify(extractedContent);

		// Check if localization exists for the default locale
		const existingLocalization = await this.localizationRepository.findOne({
			_localizationGroupId: localizationGroupId,
			locale: defaultLocale,
			_environmentId: environmentId,
			_organizationId: organizationId,
		});

		if (existingLocalization) {
			// Update existing localization
			await this.localizationRepository.update(
				{
					_id: existingLocalization._id,
					_environmentId: environmentId,
					_organizationId: organizationId,
				},
				{
					$set: {
						content: serializedContent,
						updatedAt: new Date().toISOString(),
					},
				},
				{ session },
			);

			this.logger.log(
				`Updated source content for localization group ${localizationGroupId}, locale ${defaultLocale}`,
			);
		} else {
			// Create new localization for the default locale
			await this.localizationRepository.create(
				{
					_localizationGroupId: localizationGroupId,
					locale: defaultLocale,
					content: serializedContent,
					_environmentId: environmentId,
					_organizationId: organizationId,
				},
				{ session },
			);

			this.logger.log(
				`Created source content for localization group ${localizationGroupId}, locale ${defaultLocale}`,
			);
		}

		return extractedContent;
	}

	/**
	 * Extract translatable content from control values (V2 workflows)
	 */
	private async extractFromControlValues(
		workflowId: string,
		organizationId: string,
		environmentId: string,
		resourceEntity: Record<string, unknown>,
	): Promise<Record<string, string>> {
		const content: Record<string, string> = {};

		// Fetch control values for all steps in the workflow
		const controlValues = await this.controlValuesRepository.find({
			_workflowId: workflowId,
			_environmentId: environmentId,
			_organizationId: organizationId,
			level: ControlValuesLevelEnum.STEP_CONTROLS,
		});

		this.logger.log(
			`Found ${controlValues.length} control values for workflow ${workflowId}`,
		);

		// Get step information from the workflow to map stepId to control values
		const steps = (resourceEntity.steps as Array<{ stepId?: string; _templateId?: string }>) || [];
		const stepIdMap = new Map<string, string>();
		for (const step of steps) {
			if (step._templateId && step.stepId) {
				stepIdMap.set(step._templateId, step.stepId);
			}
		}

		// Extract translatable fields from each control value
		for (const cv of controlValues) {
			const stepId = cv._stepId ? (stepIdMap.get(cv._stepId) || cv._stepId) : "unknown";
			const controls = cv.controls || {};

			this.logger.log(
				`Processing control values for step ${stepId}: ${Object.keys(controls).join(", ")}`,
			);

			// Extract common translatable fields
			if (typeof controls.subject === "string" && controls.subject) {
				content[`step.${stepId}.subject`] = controls.subject;
			}
			if (typeof controls.body === "string" && controls.body) {
				content[`step.${stepId}.body`] = controls.body;
			}
			if (typeof controls.title === "string" && controls.title) {
				content[`step.${stepId}.title`] = controls.title;
			}
			if (typeof controls.preheader === "string" && controls.preheader) {
				content[`step.${stepId}.preheader`] = controls.preheader;
			}
			if (typeof controls.senderName === "string" && controls.senderName) {
				content[`step.${stepId}.senderName`] = controls.senderName;
			}

			// Extract action labels for In-App notifications
			const primaryAction = controls.primaryAction as { label?: string } | undefined;
			if (primaryAction?.label) {
				content[`step.${stepId}.primaryAction.label`] = primaryAction.label;
			}
			const secondaryAction = controls.secondaryAction as { label?: string } | undefined;
			if (secondaryAction?.label) {
				content[`step.${stepId}.secondaryAction.label`] = secondaryAction.label;
			}
		}

		this.logger.log(
			`Extracted ${Object.keys(content).length} translatable fields from control values`,
		);

		return content;
	}

	/**
	 * Disable translations for a resource (soft-disable)
	 */
	private async disableTranslations(
		resourceId: string,
		resourceInternalId: string | undefined,
		resourceType: DalLocalizationResourceEnum,
		organizationId: string,
		environmentId: string,
	): Promise<ManageTranslationsResult> {
		// Check if group exists
		let existingGroup: LocalizationGroupEntity | null = null;

		if (resourceInternalId) {
			existingGroup = await this.localizationGroupRepository.findByResource(
				resourceType,
				resourceInternalId,
				environmentId,
				organizationId,
			);
		}

		if (!existingGroup) {
			// No group exists - nothing to disable
			this.logger.debug(
				`No LocalizationGroup found for ${resourceType}:${resourceId}, nothing to disable`,
			);

			return {
				success: true,
				enabled: false,
				shouldAutoTranslate: false,
				message: `Translations already disabled for ${resourceType} "${resourceId}"`,
			};
		}

		// Soft-disable: Keep the data but mark as disabled
		// The group will be filtered out from translations list but data is preserved for re-enable
		this.logger.log(
			`Setting enabled=false for ${resourceType}:${resourceId} (resourceInternalId: ${resourceInternalId})`,
		);

		await this.localizationGroupRepository.setEnabled(
			resourceType,
			resourceInternalId!,
			environmentId,
			organizationId,
			false,
		);

		this.logger.log(
			`Soft-disabled translations for ${resourceType}:${resourceId} (group: ${existingGroup._id})`,
		);

		return {
			success: true,
			enabled: false,
			localizationGroup: existingGroup,
			shouldAutoTranslate: false,
			message: `Translations disabled for ${resourceType} "${resourceId}" (data preserved)`,
		};
	}

	/**
	 * Check if auto-translate should be triggered
	 * Returns true if there's source content and target locales have no translations
	 */
	private async shouldTriggerAutoTranslate(
		groupId: string,
		organizationId: string,
		environmentId: string,
		extractedContent: Record<string, string>,
	): Promise<boolean> {
		// No source content to translate
		if (Object.keys(extractedContent).length === 0) {
			return false;
		}

		// Get organization settings to check target locales
		const [settings, aiSettings] = await Promise.all([
			this.settingsRepository.findByOrganization(organizationId),
			this.aiSettingsRepository.findByOrganization(organizationId),
		]);

		if (!aiSettings?.apiKey) {
			this.logger.debug("No AI provider configured, skipping auto-translate");
			return false;
		}

		const targetLocales = settings?.targetLocales || [];
		if (targetLocales.length === 0) {
			this.logger.debug("No target locales configured, skipping auto-translate");
			return false;
		}

		// Check if any target locale is missing translations
		const existingLocalizations = await this.localizationRepository.find({
			_localizationGroupId: groupId,
			_environmentId: environmentId,
			_organizationId: organizationId,
		});

		const existingLocales = new Set(existingLocalizations.map((l) => l.locale));
		const defaultLocale = settings?.defaultLocale || "en_US";

		// Check if any target locale (excluding default) needs translation
		for (const targetLocale of targetLocales) {
			if (targetLocale === defaultLocale) {
				continue;
			}

			if (!existingLocales.has(targetLocale)) {
				this.logger.log(
					`Target locale ${targetLocale} has no translation, triggering auto-translate`,
				);
				return true;
			}

			// Check if the locale has empty content
			const localization = existingLocalizations.find(
				(l) => l.locale === targetLocale,
			);
			if (localization) {
				let content: Record<string, unknown> = {};
				try {
					content =
						typeof localization.content === "string"
							? JSON.parse(localization.content)
							: localization.content || {};
				} catch {
					content = {};
				}

				if (Object.keys(content).length === 0) {
					this.logger.log(
						`Target locale ${targetLocale} has empty content, triggering auto-translate`,
					);
					return true;
				}
			}
		}

		this.logger.debug("All target locales have translations, skipping auto-translate");
		return false;
	}

	/**
	 * Convert local enum to DAL enum
	 */
	private convertToDalResourceType(
		resourceType: LocalizationResourceEnum,
	): DalLocalizationResourceEnum {
		switch (resourceType) {
			case LocalizationResourceEnum.WORKFLOW:
				return DalLocalizationResourceEnum.WORKFLOW;
			case LocalizationResourceEnum.LAYOUT:
				return DalLocalizationResourceEnum.LAYOUT;
			default:
				throw new Error(`Unknown resource type: ${resourceType}`);
		}
	}
}
