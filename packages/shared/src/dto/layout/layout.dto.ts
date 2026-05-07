import { ChannelTypeEnum, IEmailBlock, ITemplateVariable, ResourceOriginEnum, ResourceTypeEnum } from '../../types';
import { RuntimeIssue } from '../../utils/issues';
import { Controls, JSONSchemaDto } from '../workflows';

export class LayoutDto {
  _id?: string;
  _organizationId: string;
  _environmentId: string;
  _creatorId: string;
  _parentId?: string;
  name: string;
  identifier: string;
  description?: string;
  channel: ChannelTypeEnum;
  content: IEmailBlock[];
  contentType: string;
  variables?: ITemplateVariable[];
  isDefault: boolean;
  isDeleted: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export enum LayoutCreationSourceEnum {
  DASHBOARD = 'dashboard',
}

export type LayoutContainerConfig = {
  maxWidth?: string;
  align?: 'left' | 'center' | 'right';
  padding?: string;
  backgroundColor?: string;
};

export type CreateLayoutDto = {
  layoutId: string;
  name: string;
  isTranslationEnabled?: boolean;
  __source: LayoutCreationSourceEnum;
  initialControlValues?: {
    email?: {
      /**
       * Stringified Maily JSON document. When set, replaces the default empty body
       * (e.g. used by AI-generated layouts to seed the editor with real content).
       */
      body?: string;
      container?: LayoutContainerConfig;
    };
  };
};

export type EmailControlsDto = {
  body: string;
  editorType: 'html' | 'block';
  container?: LayoutContainerConfig;
};

export type LayoutControlValuesDto = {
  email?: EmailControlsDto;
};

export type UpdateLayoutDto = {
  name: string;
  isTranslationEnabled?: boolean;
  controlValues: LayoutControlValuesDto;
};

export type DuplicateLayoutDto = {
  name: string;
  /** When set, used as the new layout identifier instead of slugifying the name. */
  layoutId?: string;
  isTranslationEnabled?: boolean;
};

export type LayoutCreateAndUpdateKeys = keyof CreateLayoutDto | keyof UpdateLayoutDto;

export type LayoutResponseDto = {
  _id: string;
  slug: string;
  layoutId: string;
  name: string;
  isDefault: boolean;
  updatedAt: string;
  createdAt: string;
  origin: ResourceOriginEnum;
  type: ResourceTypeEnum;
  controls: Controls;
  variables?: JSONSchemaDto;
  isTranslationEnabled: boolean;
};

export type ListLayoutsResponse = {
  layouts: LayoutResponseDto[];
  totalCount: number;
};

export class LayoutIssuesDto {
  controls?: Record<string, RuntimeIssue[]>;
}
