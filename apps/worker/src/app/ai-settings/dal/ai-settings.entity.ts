import type { Types } from 'mongoose';

// ReNovu: worker-local mirror of apps/api/src/app/ai-settings/dal/ai-settings.entity.ts.
// The AI settings DAL currently lives only in apps/api, but the worker's
// @novu/translation module needs to resolve AI_SETTINGS_REPOSITORY (see
// ai-settings.module.ts). Until this DAL is consolidated into @novu/dal, keep
// this read-only copy in sync with the api definition.

type ChangePropsValueType<T, K extends keyof T, V = Types.ObjectId> = Omit<T, K> & {
  [P in K]: V;
};

export enum AiProviderEnum {
  OPENAI = 'openai',
}

export class AiSettingsEntity {
  _id: string;

  _organizationId: string;

  provider: AiProviderEnum;

  apiKey: string;

  model: string;

  createdAt: string;

  updatedAt: string;
}

export type AiSettingsDBModel = ChangePropsValueType<AiSettingsEntity, '_organizationId'>;
