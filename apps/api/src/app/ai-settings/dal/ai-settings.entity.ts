import type { Types } from 'mongoose';

type ChangePropsValueType<T, K extends keyof T, V = Types.ObjectId> = Omit<T, K> & {
  [P in K]: V;
};

export enum AiProviderEnum {
  OPENAI = 'openai',
}

export enum OpenAIModelEnum {
  GPT_6_LUNA = 'gpt-6-luna',
  GPT_6_1_SOL = 'gpt-6.1-sol',
  GPT_6_SOL = 'gpt-6-sol',
  // Legacy models, kept so previously saved settings still type-check.
  GPT_4O_MINI = 'gpt-4o-mini',
  GPT_4O = 'gpt-4o',
  GPT_4_TURBO = 'gpt-4-turbo',
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
