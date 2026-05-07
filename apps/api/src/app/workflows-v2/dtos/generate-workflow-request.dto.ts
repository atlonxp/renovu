import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepTypeEnum } from '@novu/shared';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GenerateWorkflowRequestDto {
  @ApiProperty({
    description: 'Natural-language brief describing the workflow to generate',
    minLength: 1,
    maxLength: 500,
    example: 'Welcome new users with an in-app and email notification',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  prompt: string;

  @ApiPropertyOptional({
    description: 'Hint which step types the workflow should include. Empty/omitted = AI decides.',
    enum: StepTypeEnum,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(StepTypeEnum, { each: true })
  channels?: StepTypeEnum[];
}

export class GenerateWorkflowStepRequestDto {
  @ApiProperty({
    description: 'Natural-language brief describing the step to generate',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  prompt: string;

  @ApiProperty({
    description: 'Step type (channel or action) to generate',
    enum: StepTypeEnum,
  })
  @IsEnum(StepTypeEnum)
  type: StepTypeEnum;
}
