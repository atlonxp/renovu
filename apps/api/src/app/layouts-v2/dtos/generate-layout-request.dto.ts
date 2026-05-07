import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateLayoutRequestDto {
  @ApiProperty({
    description: 'Natural-language brief describing the email layout to generate',
    minLength: 1,
    maxLength: 500,
    example: 'password reset email',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  prompt: string;
}
