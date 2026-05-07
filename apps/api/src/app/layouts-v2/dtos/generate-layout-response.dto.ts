import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LayoutContainerConfig } from '@novu/shared';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateLayoutResponseDto {
  @ApiProperty({
    description: 'Stringified Maily JSON document representing the AI-generated layout body',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Recommended container preset for the generated layout',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  container?: LayoutContainerConfig;
}
