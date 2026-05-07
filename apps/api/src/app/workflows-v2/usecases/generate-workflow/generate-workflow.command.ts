import { EnvironmentWithUserCommand } from '@novu/application-generic';
import { StepTypeEnum } from '@novu/shared';
import { ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateWorkflowCommand extends EnvironmentWithUserCommand {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  prompt: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(StepTypeEnum, { each: true })
  channels?: StepTypeEnum[];
}

export class GenerateWorkflowStepCommand extends EnvironmentWithUserCommand {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  prompt: string;

  @IsEnum(StepTypeEnum)
  type: StepTypeEnum;
}
