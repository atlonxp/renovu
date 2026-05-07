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
import type { UserSessionData } from '@novu/shared';

import { RequireAuthentication } from '../../auth/framework/auth.decorator';
import { AiProviderEnum, type AiSettingsEntity } from '../dal/ai-settings.entity';
import { AiSettingsRepository } from '../dal/ai-settings.repository';
import {
  AiSettingsResponseDto,
  ConnectionTestResponseDto,
  UpdateAiSettingsDto,
} from '../dtos';
import { AiProviderService } from '../services/ai-provider.service';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

@Controller('ai-settings')
@ApiTags('AI Settings')
@UseInterceptors(ClassSerializerInterceptor)
@RequireAuthentication()
export class AiSettingsController {
  private readonly logger = new Logger(AiSettingsController.name);

  constructor(
    private readonly aiSettingsRepository: AiSettingsRepository,
    private readonly aiProviderService: AiProviderService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get AI settings for the current organization' })
  async getSettings(@UserSession() user: UserSessionData): Promise<AiSettingsResponseDto | null> {
    const settings = await this.aiSettingsRepository.findByOrganization(user.organizationId);
    if (!settings) {
      return null;
    }

    return this.mapToResponseDto(settings);
  }

  @Put()
  @ApiOperation({ summary: 'Create or update AI settings (upsert, partial)' })
  async saveSettings(
    @UserSession() user: UserSessionData,
    @Body() dto: UpdateAiSettingsDto
  ): Promise<AiSettingsResponseDto> {
    this.logger.log(`Updating AI settings for org: ${user.organizationId}`);

    const provider = dto.provider ?? AiProviderEnum.OPENAI;
    const model = dto.model ?? DEFAULT_OPENAI_MODEL;

    const settings = await this.aiSettingsRepository.upsertSettings(user.organizationId, {
      provider,
      apiKey: dto.apiKey,
      model,
    });

    return this.mapToResponseDto(settings);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test the configured AI provider connection' })
  async testConnection(@UserSession() user: UserSessionData): Promise<ConnectionTestResponseDto> {
    const result = await this.aiProviderService.testConnection(user.organizationId);

    if (result.success) {
      return {
        success: true,
        message: 'Connection successful',
        model: result.model,
        latencyMs: result.latencyMs,
      };
    }

    return {
      success: false,
      message: 'Connection failed',
      error: result.error,
      latencyMs: result.latencyMs,
    };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete AI settings for the organization' })
  async clearSettings(@UserSession() user: UserSessionData): Promise<void> {
    const deleted = await this.aiSettingsRepository.deleteByOrganization(user.organizationId);
    if (!deleted) {
      this.logger.debug(`No AI settings found to delete for org: ${user.organizationId}`);
    }
  }

  private mapToResponseDto(settings: AiSettingsEntity): AiSettingsResponseDto {
    const hasApiKey = !!settings.apiKey && settings.apiKey.length > 0;
    const apiKeyLast4 = hasApiKey ? settings.apiKey.slice(-4) : undefined;

    return {
      _id: settings._id,
      _organizationId: settings._organizationId,
      hasApiKey,
      apiKeyLast4,
      provider: settings.provider,
      model: settings.model,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}
