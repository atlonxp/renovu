import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AiProviderEnum } from '../dal/ai-settings.entity';

export class AiSettingsResponseDto {
  @ApiProperty({ description: 'Unique identifier for the AI settings' })
  _id: string;

  @ApiProperty({ description: 'Organization ID these settings belong to' })
  _organizationId: string;

  @ApiProperty({ description: 'Whether an API key is configured', example: true })
  hasApiKey: boolean;

  @ApiPropertyOptional({ description: 'Last 4 characters of the API key', example: '1234' })
  apiKeyLast4?: string;

  @ApiProperty({ description: 'AI provider', enum: AiProviderEnum, example: AiProviderEnum.OPENAI })
  provider: AiProviderEnum;

  @ApiProperty({ description: 'AI model identifier (free-form per provider)', example: 'gpt-4o-mini' })
  model: string;

  @ApiProperty({ description: 'When the settings were created' })
  createdAt: string;

  @ApiProperty({ description: 'When the settings were last updated' })
  updatedAt: string;
}
