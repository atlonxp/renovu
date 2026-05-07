import { EnvironmentWithUserCommand } from '@novu/application-generic';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateLayoutCommand extends EnvironmentWithUserCommand {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  prompt: string;
}
