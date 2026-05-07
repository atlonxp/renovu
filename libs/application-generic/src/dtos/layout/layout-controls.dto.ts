import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

export class LayoutContainerConfigDto {
  @ApiPropertyOptional({
    description: 'Maximum width of the email container (e.g. "600px", "800px", "100%").',
  })
  @IsOptional()
  @IsString()
  maxWidth?: string;

  @ApiPropertyOptional({
    description: 'Alignment of the email container.',
    enum: ['left', 'center', 'right'],
  })
  @IsOptional()
  @IsString()
  @IsEnum(['left', 'center', 'right'])
  align?: 'left' | 'center' | 'right';

  @ApiPropertyOptional({
    description: 'CSS shorthand padding (e.g. "1rem" or "16px 24px").',
  })
  @IsOptional()
  @IsString()
  padding?: string;

  @ApiPropertyOptional({
    description: 'Background color of the container (hex).',
  })
  @IsOptional()
  @IsString()
  backgroundColor?: string;
}

export class EmailControlsDto {
  @ApiProperty({
    description: 'Body of the layout.',
  })
  @IsString()
  body: string;

  @ApiProperty({
    description: 'Editor type of the layout.',
    enum: ['html', 'block'],
  })
  @IsString()
  @IsEnum(['html', 'block'])
  editorType: 'html' | 'block';

  @ApiPropertyOptional({
    description: 'Container configuration for the email layout.',
    type: LayoutContainerConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutContainerConfigDto)
  container?: LayoutContainerConfigDto;
}

export class LayoutControlValuesDto {
  @ApiPropertyOptional({
    description: 'Email layout controls',
  })
  @IsOptional()
  @ValidateNested()
  email?: EmailControlsDto;
}
