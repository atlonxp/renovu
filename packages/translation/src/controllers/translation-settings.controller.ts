import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserSession } from '@novu/application-generic';
import type { UserSessionData } from '@novu/shared';

import { TranslationSettingsRepository } from '../dal';
import type {
  TranslationSettingsResponseDto,
  UpdateTranslationSettingsDto,
} from '../dtos';

/**
 * Controller for managing organization translation settings.
 *
 * AI provider configuration (API key, model) lives in `/v1/ai-settings`.
 * This controller now only handles locale-related fields.
 */
@Controller('translation-settings')
@ApiTags('Translation Settings')
@UseInterceptors(ClassSerializerInterceptor)
@ApiExcludeController()
export class TranslationSettingsController {
  private readonly logger = new Logger(TranslationSettingsController.name);

  constructor(private readonly settingsRepository: TranslationSettingsRepository) {}

  @Get()
  @ApiOperation({ summary: 'Get translation settings (locale-only)' })
  async getSettings(
    @UserSession() user: UserSessionData
  ): Promise<TranslationSettingsResponseDto | null> {
    const settings = await this.settingsRepository.findByOrganization(user.organizationId);
    if (!settings) {
      return null;
    }

    return this.mapToResponseDto(settings);
  }

  @Put()
  @ApiOperation({ summary: 'Update translation settings (locale-only, partial upsert)' })
  async saveSettings(
    @UserSession() user: UserSessionData,
    @Body() dto: UpdateTranslationSettingsDto
  ): Promise<TranslationSettingsResponseDto> {
    this.logger.log(`Updating translation settings for org: ${user.organizationId}`);

    const settings = await this.settingsRepository.upsertSettings(user.organizationId, {
      defaultLocale: dto.defaultLocale,
      targetLocales: dto.targetLocales,
      localeAliases: dto.localeAliases,
    });

    return this.mapToResponseDto(settings);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete translation settings' })
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
  }): TranslationSettingsResponseDto {
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
