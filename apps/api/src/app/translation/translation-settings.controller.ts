import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AI_SETTINGS_REPOSITORY, type IAiSettingsLookup, UserSession } from '@novu/application-generic';
import { LocalizationGroupRepository, LocalizationRepository } from '@novu/dal';
import type { UserSessionData } from '@novu/shared';
import {
  AutoTranslate,
  LocalizationResourceEnum,
  TranslationSettingsRepository,
} from '@novu/translation';

import { RequireAuthentication } from '../auth/framework/auth.decorator';

@Controller('translation-settings')
@ApiTags('Translation Settings')
@UseInterceptors(ClassSerializerInterceptor)
@RequireAuthentication()
export class TranslationSettingsController {
  private readonly logger = new Logger(TranslationSettingsController.name);

  constructor(
    private readonly settingsRepository: TranslationSettingsRepository,
    @Inject(AI_SETTINGS_REPOSITORY)
    private readonly aiSettingsRepository: IAiSettingsLookup,
    private readonly localizationGroupRepository: LocalizationGroupRepository,
    private readonly localizationRepository: LocalizationRepository,
    private readonly autoTranslate: AutoTranslate
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get translation settings',
    description: 'Returns locale settings for the current organization. AI provider lives in /v1/ai-settings.',
  })
  async getSettings(@UserSession() user: UserSessionData) {
    const settings = await this.settingsRepository.findByOrganization(user.organizationId);

    if (!settings) {
      return null;
    }

    return this.mapToResponseDto(settings);
  }

  @Put()
  @ApiOperation({
    summary: 'Update translation settings',
    description: 'Creates or updates locale-related translation settings. AI provider lives in /v1/ai-settings.',
  })
  async saveSettings(
    @UserSession() user: UserSessionData,
    @Body() dto: { defaultLocale?: string; targetLocales?: string[]; localeAliases?: Record<string, string> }
  ) {
    this.logger.log(`Updating translation settings for org: ${user.organizationId}`);

    // Get existing settings to detect new locales
    const existingSettings = await this.settingsRepository.findByOrganization(user.organizationId);
    const existingLocales = new Set(existingSettings?.targetLocales || []);
    const newTargetLocales = dto.targetLocales || [];

    // Detect newly added locales
    const newlyAddedLocales = newTargetLocales.filter((locale) => !existingLocales.has(locale));

    const settings = await this.settingsRepository.upsertSettings(user.organizationId, {
      defaultLocale: dto.defaultLocale,
      targetLocales: dto.targetLocales,
      localeAliases: dto.localeAliases,
    });

    this.logger.log(`Translation settings updated for org: ${user.organizationId}`);

    // Auto-translate for new locales OR fill in empty translations for existing locales
    const aiSettings = await this.aiSettingsRepository.findByOrganization(user.organizationId);
    if (aiSettings?.apiKey && newTargetLocales.length > 0) {
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
      const groups = await this.localizationGroupRepository.findEnabledGroups(
        user.environmentId,
        user.organizationId
      );

      if (groups.length === 0) {
        this.logger.debug('No enabled localization groups found, skipping auto-translate');
        return;
      }

      this.logger.log(`Found ${groups.length} enabled localization groups to check`);

      const settings = await this.settingsRepository.findByOrganization(user.organizationId);
      const defaultLocale = settings?.defaultLocale || 'en_US';

      for (const group of groups) {
        try {
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

          const localesToTranslate: string[] = [];

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
            if (targetLocale === defaultLocale) {
              continue;
            }

            const existingContent = existingLocaleMap.get(targetLocale);

            if (!existingContent) {
              localesToTranslate.push(targetLocale);
            } else {
              try {
                const parsed = typeof existingContent === 'string' ? JSON.parse(existingContent) : existingContent;
                if (!parsed || Object.keys(parsed).length === 0) {
                  localesToTranslate.push(targetLocale);
                }
              } catch {
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

          const resourceType =
            group.resourceType === 'workflow' ? LocalizationResourceEnum.WORKFLOW : LocalizationResourceEnum.LAYOUT;

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

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete translation settings',
    description: 'Removes locale settings for the organization.',
  })
  async clearSettings(@UserSession() user: UserSessionData): Promise<void> {
    const deleted = await this.settingsRepository.deleteByOrganization(user.organizationId);
    if (!deleted) {
      this.logger.debug(`No translation settings found to delete for org: ${user.organizationId}`);
    }
  }

  private mapToResponseDto(settings: {
    _id: string;
    _organizationId: string;
    defaultLocale: string;
    targetLocales: string[];
    localeAliases?: Record<string, string>;
    createdAt: string;
    updatedAt: string;
  }) {
    return {
      _id: settings._id,
      _organizationId: settings._organizationId,
      defaultLocale: settings.defaultLocale,
      targetLocales: settings.targetLocales,
      localeAliases: settings.localeAliases || {},
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
