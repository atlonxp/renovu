import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { AiProviderEnum } from '../dal/ai-settings.entity';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ description: 'AI provider', enum: AiProviderEnum, example: AiProviderEnum.OPENAI })
  @IsOptional()
  @IsEnum(AiProviderEnum, {
    message: `Provider must be one of: ${Object.values(AiProviderEnum).join(', ')}`,
  })
  provider?: AiProviderEnum;

  @ApiPropertyOptional({ description: 'API key (will be encrypted)', example: 'sk-proj-xxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString()
  @MinLength(20, { message: 'API key is too short' })
  @MaxLength(200, { message: 'API key is too long' })
  @Matches(/^[a-zA-Z0-9_\-.]+$/, {
    message: 'API key contains invalid characters',
  })
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Model identifier', example: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model?: string;
}
