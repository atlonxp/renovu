import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserSession } from '@novu/application-generic';
import {
  LocalizationGroupRepository,
  LocalizationRepository,
  LocalizationResourceEnum,
  OrganizationRepository,
  type LocalizationGroupEntity,
} from '@novu/dal';
import type { UserSessionData } from '@novu/shared';
import { DEFAULT_LOCALE } from '@novu/shared';
import {
  AutoTranslate,
  LocalizationResourceEnum as TranslationResourceEnum,
  TranslationSettingsRepository,
} from '@novu/translation';

import { RequireAuthentication } from '../auth/framework/auth.decorator';

/**
 * Response DTO for translation group list item
 */
interface TranslationGroupDto {
  resourceId: string;
  resourceType: string;
  resourceName: string;
  locales: string[];
  outdatedLocales?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Response DTO for paginated translation groups
 */
interface GetTranslationsListResponse {
  data: TranslationGroupDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Response DTO for a single translation
 */
interface TranslationResponseDto {
  resourceId: string;
  resourceType: string;
  locale: string;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * API Controller for managing translations (v2)
 *
 * Provides endpoints for listing and managing translation groups
 */
@Controller({ path: 'translations', version: '2' })
@ApiTags('Translations')
@UseInterceptors(ClassSerializerInterceptor)
@RequireAuthentication()
export class TranslationsController {
  private readonly logger = new Logger(TranslationsController.name);

  constructor(
    private readonly localizationGroupRepository: LocalizationGroupRepository,
    private readonly localizationRepository: LocalizationRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly autoTranslate: AutoTranslate,
    private readonly translationSettingsRepository: TranslationSettingsRepository
  ) {}

  @Get('list')
  @ApiOperation({
    summary: 'Get translation groups list',
    description: 'Returns a paginated list of translation groups for the current environment.',
  })
  @ApiQuery({ name: 'query', required: false, description: 'Search query for resource name or ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page', example: 10 })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of items to skip', example: 0 })
  async getTranslationsList(
    @UserSession() user: UserSessionData,
    @Query('query') query?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ): Promise<GetTranslationsListResponse> {
    const limit = Math.min(parseInt(limitStr || '10', 10) || 10, 100);
    const offset = parseInt(offsetStr || '0', 10) || 0;

    this.logger.debug(
      `Getting translation groups for env: ${user.environmentId}, query: ${query}, limit: ${limit}, offset: ${offset}`
    );

    const { data, totalCount } = await this.localizationGroupRepository.findPaginatedGroups(
      user.environmentId,
      user.organizationId,
      { query, limit, offset }
    );

    // Transform to DTO and fetch locales for each group
    const translationGroups = await Promise.all(
      data.map(async (group) => this.mapToDto(group, user.environmentId, user.organizationId))
    );

    return {
      data: translationGroups,
      total: totalCount,
      limit,
      offset,
    };
  }

  @Get('group/:resourceType/:resourceId')
  @ApiOperation({
    summary: 'Get translation group',
    description: 'Returns a translation group for a specific resource.',
  })
  @ApiParam({ name: 'resourceType', description: 'Type of resource (workflow or layout)' })
  @ApiParam({ name: 'resourceId', description: 'Resource identifier' })
  async getTranslationGroup(
    @UserSession() user: UserSessionData,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string
  ): Promise<TranslationGroupDto> {
    this.logger.debug(`Getting translation group for ${resourceType}:${resourceId}`);

    // Find the group by resourceId (slug)
    const groups = await this.localizationGroupRepository.find({
      resourceId,
      resourceType: resourceType as LocalizationResourceEnum,
      _environmentId: user.environmentId,
      _organizationId: user.organizationId,
    });

    const group = groups[0];

    if (!group) {
      throw new NotFoundException(`Translation group not found for ${resourceType}:${resourceId}`);
    }

    return this.mapToDto(group, user.environmentId, user.organizationId);
  }

  @Get(':resourceType/:resourceId/:locale')
  @ApiOperation({
    summary: 'Get translation',
    description: 'Returns a translation for a specific resource and locale.',
  })
  @ApiParam({ name: 'resourceType', description: 'Type of resource (workflow or layout)' })
  @ApiParam({ name: 'resourceId', description: 'Resource identifier' })
  @ApiParam({ name: 'locale', description: 'Locale code (e.g., en_US, ja_JP)' })
  async getTranslation(
    @UserSession() user: UserSessionData,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Param('locale') locale: string
  ): Promise<TranslationResponseDto> {
    this.logger.debug(`Getting translation for ${resourceType}:${resourceId}:${locale}`);

    // Find the group first
    const groups = await this.localizationGroupRepository.find({
      resourceId,
      resourceType: resourceType as LocalizationResourceEnum,
      _environmentId: user.environmentId,
      _organizationId: user.organizationId,
    });

    const group = groups[0];

    if (!group) {
      throw new NotFoundException(`Translation group not found for ${resourceType}:${resourceId}`);
    }

    // Find the localization for this locale
    const localizations = await this.localizationRepository.find({
      _localizationGroupId: group._id,
      locale,
      _environmentId: user.environmentId,
      _organizationId: user.organizationId,
    });

    const localization = localizations[0];

    if (!localization) {
      // Return empty translation for the locale
      return {
        resourceId,
        resourceType,
        locale,
        content: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Parse content if it's a JSON string
    let content: Record<string, unknown> = {};
    if (localization.content) {
      try {
        content = typeof localization.content === 'string'
          ? JSON.parse(localization.content)
          : localization.content;
      } catch {
        content = {};
      }
    }

    return {
      resourceId,
      resourceType,
      locale: localization.locale,
      content,
      createdAt: localization.createdAt,
      updatedAt: localization.updatedAt,
    };
  }

  @Post('auto-translate/:resourceType/:resourceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger auto-translation',
    description:
      'Translates the source content to all configured target locales using OpenAI. ' +
      'Reads the source locale content and translates it to all target locales configured in org settings.',
  })
  @ApiParam({ name: 'resourceType', description: 'Type of resource (workflow or layout)' })
  @ApiParam({ name: 'resourceId', description: 'Resource identifier' })
  @ApiBody({
    description: 'Optional: Override source content or target locales',
    required: false,
    schema: {
      type: 'object',
      properties: {
        sourceContent: {
          type: 'object',
          description: 'Optional: Override source content (if not provided, reads from default locale)',
        },
        targetLocales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Override target locales',
        },
      },
    },
  })
  async triggerAutoTranslate(
    @UserSession() user: UserSessionData,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Body() body?: { sourceContent?: Record<string, string>; targetLocales?: string[] }
  ) {
    this.logger.log(`Auto-translate requested for ${resourceType}:${resourceId} by org: ${user.organizationId}`);

    // Find the group
    const groups = await this.localizationGroupRepository.find({
      resourceId,
      resourceType: resourceType as LocalizationResourceEnum,
      _environmentId: user.environmentId,
      _organizationId: user.organizationId,
    });

    const group = groups[0];
    if (!group) {
      throw new NotFoundException(`Translation group not found for ${resourceType}:${resourceId}`);
    }

    // Get source content from body or from default locale
    let sourceContent = body?.sourceContent;

    if (!sourceContent || Object.keys(sourceContent).length === 0) {
      // Get organization's default locale
      const organization = await this.organizationRepository.findById(user.organizationId);
      const defaultLocale = organization?.defaultLocale || DEFAULT_LOCALE;

      // Fetch the default locale content
      const defaultLocalizations = await this.localizationRepository.find({
        _localizationGroupId: group._id,
        locale: defaultLocale,
        _environmentId: user.environmentId,
        _organizationId: user.organizationId,
      });

      const defaultLocalization = defaultLocalizations[0];
      if (!defaultLocalization?.content) {
        throw new NotFoundException(`No source content found for ${resourceType}:${resourceId} in locale ${defaultLocale}`);
      }

      try {
        sourceContent =
          typeof defaultLocalization.content === 'string'
            ? JSON.parse(defaultLocalization.content)
            : defaultLocalization.content;
      } catch {
        throw new NotFoundException(`Invalid source content for ${resourceType}:${resourceId}`);
      }
    }

    // Map resource type
    const translationResourceType =
      resourceType === 'workflow' ? TranslationResourceEnum.WORKFLOW : TranslationResourceEnum.LAYOUT;

    // Execute auto-translate
    const result = await this.autoTranslate.execute({
      resourceId,
      resourceInternalId: group._resourceInternalId,
      resourceType: translationResourceType,
      organizationId: user.organizationId,
      environmentId: user.environmentId,
      userId: user._id,
      sourceContent: sourceContent as Record<string, string>,
      targetLocales: body?.targetLocales,
    });

    this.logger.log(
      `Auto-translate completed for ${resourceType}:${resourceId}: ` +
        `${result.metadata.successfulLocales}/${result.metadata.totalLocales} locales in ${result.metadata.totalLatencyMs}ms`
    );

    return {
      success: result.success,
      sourceLocale: result.sourceLocale,
      results: result.results.map((r) => ({
        locale: r.locale,
        success: r.success,
        error: r.error,
        warnings: r.warnings,
      })),
      metadata: {
        totalLocales: result.metadata.totalLocales,
        successfulLocales: result.metadata.successfulLocales,
        failedLocales: result.metadata.failedLocales,
        totalLatencyMs: result.metadata.totalLatencyMs,
      },
    };
  }

  /**
   * Map LocalizationGroupEntity to TranslationGroupDto
   * Includes organization's configured locales (defaultLocale + targetLocales) even if no translations exist
   */
  private async mapToDto(
    group: LocalizationGroupEntity,
    environmentId: string,
    organizationId: string
  ): Promise<TranslationGroupDto> {
    // Get all localizations for this group to determine existing translation locales
    const localizations = await this.localizationRepository.find({
      _localizationGroupId: group._id,
      _environmentId: environmentId,
      _organizationId: organizationId,
    });

    const existingLocales = [...new Set(localizations.map((loc) => loc.locale))];

    // Get translation settings to include configured locales
    const translationSettings = await this.translationSettingsRepository.findByOrganization(organizationId);
    const orgDefaultLocale = translationSettings?.defaultLocale || DEFAULT_LOCALE;
    const orgTargetLocales = translationSettings?.targetLocales || [];

    // Combine: organization default locale + target locales + existing locales
    const allConfiguredLocales = new Set<string>();

    // Add organization's default locale first
    if (orgDefaultLocale) {
      allConfiguredLocales.add(orgDefaultLocale);
    }

    // Add organization's target locales
    for (const locale of orgTargetLocales) {
      allConfiguredLocales.add(locale);
    }

    // Add any existing locales that might not be in org settings
    for (const locale of existingLocales) {
      allConfiguredLocales.add(locale);
    }

    // Convert to array - default locale first if present, then others
    const locales: string[] = [];
    if (orgDefaultLocale && allConfiguredLocales.has(orgDefaultLocale)) {
      locales.push(orgDefaultLocale);
      allConfiguredLocales.delete(orgDefaultLocale);
    }
    locales.push(...Array.from(allConfiguredLocales));

    return {
      resourceId: group.resourceId,
      resourceType: group.resourceType,
      resourceName: group.resourceName,
      locales,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
