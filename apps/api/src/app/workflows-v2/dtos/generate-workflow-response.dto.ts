import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepTypeEnum } from '@novu/shared';
import { IsArray, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class GeneratedStepDto {
  @ApiProperty({ description: 'Display name for the step', example: 'Welcome email' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Step type', enum: StepTypeEnum })
  @IsEnum(StepTypeEnum)
  type: StepTypeEnum;

  @ApiPropertyOptional({
    description: 'Channel/step control values populated by the AI',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  controlValues?: Record<string, unknown>;
}

export class GenerateWorkflowResponseDto {
  @ApiProperty({ description: 'Suggested workflow name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Suggested workflow description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Suggested workflow tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ description: 'Generated steps in execution order', type: [GeneratedStepDto] })
  @IsArray()
  steps: GeneratedStepDto[];
}

export class GenerateWorkflowStepResponseDto {
  @ApiProperty({ description: 'Display name for the step' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Step type', enum: StepTypeEnum })
  @IsEnum(StepTypeEnum)
  type: StepTypeEnum;

  @ApiPropertyOptional({
    description: 'Channel/step control values populated by the AI',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  controlValues?: Record<string, unknown>;
}
