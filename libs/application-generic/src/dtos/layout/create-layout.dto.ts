import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LayoutCreationSourceEnum } from '../../types';
import { LayoutContainerConfigDto } from './layout-controls.dto';

export class CreateLayoutEmailInitialControlsDto {
  @ApiPropertyOptional({
    description: 'Initial container configuration for the email layout.',
    type: LayoutContainerConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutContainerConfigDto)
  container?: LayoutContainerConfigDto;

  @ApiPropertyOptional({
    description:
      'Stringified Maily JSON document used to seed the layout body. When omitted, an empty body is used. Used by AI-generated layouts.',
  })
  @IsOptional()
  @IsString()
  body?: string;
}

export class CreateLayoutInitialControlValuesDto {
  @ApiPropertyOptional({
    description: 'Initial control values for the email channel.',
    type: CreateLayoutEmailInitialControlsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateLayoutEmailInitialControlsDto)
  email?: CreateLayoutEmailInitialControlsDto;
}

export class CreateLayoutDto {
  @ApiProperty({ description: 'Unique identifier for the layout' })
  @IsString()
  layoutId: string;

  @ApiProperty({ description: 'Name of the layout' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Enable or disable translations for this layout',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isTranslationEnabled?: boolean;

  @ApiProperty({
    description: 'Source of layout creation',
    enum: LayoutCreationSourceEnum,
    enumName: 'LayoutCreationSourceEnum',
    required: false,
    default: LayoutCreationSourceEnum.DASHBOARD,
  })
  @IsOptional()
  @IsEnum(LayoutCreationSourceEnum)
  __source?: LayoutCreationSourceEnum;

  @ApiPropertyOptional({
    description: 'Initial control values to seed into the layout on creation.',
    type: CreateLayoutInitialControlValuesDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateLayoutInitialControlValuesDto)
  initialControlValues?: CreateLayoutInitialControlValuesDto;
}
