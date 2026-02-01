import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserSession } from '@novu/application-generic';
import { LocalizationGroupRepository, LocalizationRepository } from '@novu/dal';
import type { UserSessionData } from '@novu/shared';
import {
  AutoTranslate,
  LocalizationResourceEnum,
  OpenAIModelEnum,
  TranslationSettingsRepository,
  OpenAITranslationService,
} from '@novu/translation';

import { RequireAuthentication } from '../auth/framework/auth.decorator';

/**
 * API Controller for managing organization translation settings
 * This wraps the translation package controller with proper authentication
 */
@Controller('translation-settings')
@ApiTags('Translation Settings')
@UseInterceptors(ClassSerializerInterceptor)
@RequireAuthentication()
export class TranslationSettingsController {
  private readonly logger = new Logger(TranslationSettingsController.name);

  constructor(
    private readonly settingsRepository: TranslationSettingsRepository,
    private readonly openAITranslationService: OpenAITranslationService,
    private readonly localizationGroupRepository: LocalizationGroupRepository,
    private readonly localizationRepository: LocalizationRepository,
    private readonly autoTranslate: AutoTranslate
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get translation settings',
    description: 'Returns the translation settings for the current organization. API key is masked for security.',
  })
  async getSettings(@UserSession() user: UserSessionData) {
    this.logger.log(`Getting translation settings for org: ${user.organizationId}`);

    const settings = await this.settingsRepository.findByOrganization(user.organizationId);

    this.logger.log(`Settings found: ${settings ? 'yes' : 'no'}, hasApiKey: ${settings?.openaiApiKey ? 'yes' : 'no'}`);

    if (!settings) {
      return null;
    }

    const response = this.mapToResponseDto(settings);
    this.logger.log(`Response hasApiKey: ${response.hasApiKey}, apiKeyLast4: ${response.apiKeyLast4}`);

    return response;
  }

  @Put()
  @ApiOperation({
    summary: 'Update translation settings',
    description: 'Creates or updates translation settings for the organization. Supports partial updates.',
  })
  async saveSettings(
    @UserSession() user: UserSessionData,
    @Body() dto: { openaiApiKey?: string; openaiModel?: OpenAIModelEnum; defaultLocale?: string; targetLocales?: string[] }
  ) {
    this.logger.log(`Updating translation settings for org: ${user.organizationId}`);

    // Get existing settings to detect new locales
    const existingSettings = await this.settingsRepository.findByOrganization(user.organizationId);
    const existingLocales = new Set(existingSettings?.targetLocales || []);
    const newTargetLocales = dto.targetLocales || [];

    // Detect newly added locales
    const newlyAddedLocales = newTargetLocales.filter((locale) => !existingLocales.has(locale));

    const settings = await this.settingsRepository.upsertSettings(user.organizationId, {
      openaiApiKey: dto.openaiApiKey,
      openaiModel: dto.openaiModel,
      defaultLocale: dto.defaultLocale,
      targetLocales: dto.targetLocales,
    });

    this.logger.log(`Translation settings updated for org: ${user.organizationId}`);

    // Auto-translate for new locales OR fill in empty translations for existing locales
    if (settings.openaiApiKey && newTargetLocales.length > 0) {
      this.triggerAutoTranslateForMissingLocales(user, newTargetLocales, newlyAddedLocales).catch((error) => {
        this.logger.error(`Failed to auto-translate for missing locales: ${error.message}`);
      });
    }

    return this.mapToResponseDto(settings);
  }

  /**
   * Trigger auto-translation for missing/empty locales across all enabled translation groups
   * - Always translates newly added locales
   * - Also checks existing target locales for empty translations and fills them
   */
  private async triggerAutoTranslateForMissingLocales(
    user: UserSessionData,
    allTargetLocales: string[],
    newlyAddedLocales: string[]
  ) {
    this.logger.log(
      `Checking auto-translate for ${allTargetLocales.length} target locales (${newlyAddedLocales.length} new) in org: ${user.organizationId}`
    );

    try {
      // Find all enabled localization groups for this organization
      const groups = await this.localizationGroupRepository.findEnabledGroups(
        user.environmentId,
        user.organizationId
      );

      if (groups.length === 0) {
        this.logger.debug('No enabled localization groups found, skipping auto-translate');
        return;
      }

      this.logger.log(`Found ${groups.length} enabled localization groups to check`);

      // Get settings to find default locale
      const settings = await this.settingsRepository.findByOrganization(user.organizationId);
      const defaultLocale = settings?.defaultLocale || 'en_US';

      // Process each group
      for (const group of groups) {
        try {
          // Get source content from default locale
          const sourceLocalization = await this.localizationRepository.findOne({
            _localizationGroupId: group._id,
            locale: defaultLocale,
            _environmentId: user.environmentId,
            _organizationId: user.organizationId,
          });

          if (!sourceLocalization?.content) {
            this.logger.debug(`No source content for group ${group._id}, skipping`);
            continue;
          }

          // Parse source content
          let sourceContent: Record<string, string>;
          try {
            sourceContent =
              typeof sourceLocalization.content === 'string'
                ? JSON.parse(sourceLocalization.content)
                : sourceLocalization.content;
          } catch {
            this.logger.debug(`Invalid source content for group ${group._id}, skipping`);
            continue;
          }

          if (Object.keys(sourceContent).length === 0) {
            continue;
          }

          // Find locales that need translation (new locales + existing locales with empty content)
          const localesToTranslate: string[] = [];

          // Get all existing localizations for this group
          const existingLocalizations = await this.localizationRepository.find({
            _localizationGroupId: group._id,
            _environmentId: user.environmentId,
            _organizationId: user.organizationId,
          });

          const existingLocaleMap = new Map<string, string>();
          for (const loc of existingLocalizations) {
            existingLocaleMap.set(loc.locale, loc.content || '');
          }

          for (const targetLocale of allTargetLocales) {
            // Skip the default/source locale
            if (targetLocale === defaultLocale) {
              continue;
            }

            // Check if this locale needs translation
            const existingContent = existingLocaleMap.get(targetLocale);

            if (!existingContent) {
              // Locale doesn't exist at all
              localesToTranslate.push(targetLocale);
            } else {
              // Check if content is empty
              try {
                const parsed = typeof existingContent === 'string' ? JSON.parse(existingContent) : existingContent;
                if (!parsed || Object.keys(parsed).length === 0) {
                  localesToTranslate.push(targetLocale);
                }
              } catch {
                // Invalid JSON, treat as empty
                localesToTranslate.push(targetLocale);
              }
            }
          }

          if (localesToTranslate.length === 0) {
            this.logger.debug(`No missing locales for group ${group._id}, skipping`);
            continue;
          }

          this.logger.log(
            `Group ${group.resourceId} needs translation for: ${localesToTranslate.join(', ')}`
          );

          // Map resource type
          const resourceType =
            group.resourceType === 'workflow' ? LocalizationResourceEnum.WORKFLOW : LocalizationResourceEnum.LAYOUT;

          // Trigger translation for missing locales
          const result = await this.autoTranslate.execute({
            resourceId: group.resourceId,
            resourceInternalId: group._resourceInternalId,
            resourceType,
            organizationId: user.organizationId,
            environmentId: user.environmentId,
            userId: user._id,
            sourceContent,
            targetLocales: localesToTranslate,
          });

          this.logger.log(
            `Auto-translated ${group.resourceId}: ${result.metadata.successfulLocales}/${result.metadata.totalLocales} locales`
          );
        } catch (error) {
          this.logger.error(`Failed to auto-translate group ${group._id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in triggerAutoTranslateForMissingLocales: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test OpenAI connection',
    description: 'Tests the OpenAI API connection using the configured API key.',
  })
  async testConnection(@UserSession() user: UserSessionData) {
    this.logger.debug(`Testing OpenAI connection for org: ${user.organizationId}`);

    const settings = await this.settingsRepository.findByOrganization(user.organizationId);

    if (!settings) {
      return {
        success: false,
        message: 'Translation settings not configured',
        error: 'Please configure translation settings first',
      };
    }

    if (!settings.openaiApiKey) {
      return {
        success: false,
        message: 'API key not configured',
        error: 'Please configure an OpenAI API key',
      };
    }

    try {
      const testResult = await this.openAITranslationService.testConnection(user.organizationId);

      if (testResult.success) {
        this.logger.log(`OpenAI connection test successful for org: ${user.organizationId}`);

        return {
          success: true,
          message: 'Connection successful',
          model: testResult.model,
          latencyMs: testResult.latencyMs,
        };
      }

      this.logger.warn(`OpenAI connection test failed for org: ${user.organizationId}: ${testResult.error}`);

      return {
        success: false,
        message: 'Connection failed',
        error: testResult.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`OpenAI connection test error for org: ${user.organizationId}: ${errorMessage}`);

      return {
        success: false,
        message: 'Connection test failed',
        error: errorMessage,
      };
    }
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete translation settings',
    description: 'Removes all translation settings for the organization.',
  })
  async clearSettings(@UserSession() user: UserSessionData): Promise<void> {
    this.logger.log(`Deleting translation settings for org: ${user.organizationId}`);

    const deleted = await this.settingsRepository.deleteByOrganization(user.organizationId);

    if (!deleted) {
      this.logger.debug(`No translation settings found to delete for org: ${user.organizationId}`);
    } else {
      this.logger.log(`Translation settings deleted for org: ${user.organizationId}`);
    }
  }

  private mapToResponseDto(settings: {
    _id: string;
    _organizationId: string;
    openaiApiKey?: string;
    openaiModel: string;
    defaultLocale: string;
    targetLocales: string[];
    createdAt: string;
    updatedAt: string;
  }) {
    const hasApiKey = !!settings.openaiApiKey && settings.openaiApiKey.length > 0;
    let apiKeyLast4: string | undefined;
    if (hasApiKey && settings.openaiApiKey) {
      apiKeyLast4 = settings.openaiApiKey.slice(-4);
    }

    const validModels = Object.values(OpenAIModelEnum) as string[];
    const openaiModel = validModels.includes(settings.openaiModel)
      ? settings.openaiModel
      : OpenAIModelEnum.GPT_4O_MINI;

    return {
      _id: settings._id,
      _organizationId: settings._organizationId,
      hasApiKey,
      apiKeyLast4,
      openaiModel,
      defaultLocale: settings.defaultLocale,
      targetLocales: settings.targetLocales,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
