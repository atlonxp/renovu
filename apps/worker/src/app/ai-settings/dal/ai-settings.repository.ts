import { decryptApiKey, type IAiSettingsLookup } from '@novu/application-generic';
import { plainToInstance } from 'class-transformer';
import { type Model, Types } from 'mongoose';

import { type AiSettingsDBModel, AiSettingsEntity } from './ai-settings.entity';
import { AiSettings } from './ai-settings.schema';

// ReNovu: worker-local, read-only mirror of apps/api's AiSettingsRepository.
// Implements the IAiSettingsLookup contract from @novu/application-generic so
// @novu/translation's OpenAITranslationService can resolve AI_SETTINGS_REPOSITORY
// in the worker (the api app provides the full read/write repository). Only the
// read path (findByOrganization) is needed here — translation jobs read the
// org's AI provider config to call OpenAI.
export class AiSettingsRepository implements IAiSettingsLookup {
  private readonly model: Model<AiSettingsDBModel>;

  constructor() {
    this.model = AiSettings;
  }

  private toObjectId(value: string): Types.ObjectId {
    return new Types.ObjectId(value);
  }

  private mapEntity(data: AiSettingsDBModel | null): AiSettingsEntity | null {
    if (!data) {
      return null;
    }

    const plain = JSON.parse(JSON.stringify(data));
    const entity = plainToInstance(AiSettingsEntity, plain);

    if (entity.apiKey) {
      try {
        entity.apiKey = decryptApiKey(entity.apiKey);
      } catch {
        // Tolerate unencrypted legacy values during migration
      }
    }

    return entity;
  }

  async findByOrganization(organizationId: string): Promise<AiSettingsEntity | null> {
    const result = await this.model.findOne({ _organizationId: this.toObjectId(organizationId) }).lean();

    return this.mapEntity(result as AiSettingsDBModel | null);
  }
}
