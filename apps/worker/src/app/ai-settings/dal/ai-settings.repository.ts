import { decryptApiKey, type IAiSettingsLookup } from '@novu/application-generic';
import { mongoose } from '@novu/dal';
import { plainToInstance } from 'class-transformer';

import { type AiSettingsDBModel, AiSettingsEntity } from './ai-settings.entity';
import { AiSettings } from './ai-settings.schema';

// ReNovu: worker-local, read-only mirror of apps/api's AiSettingsRepository.
// Implements the IAiSettingsLookup contract from @novu/application-generic so
// @novu/translation's OpenAITranslationService can resolve AI_SETTINGS_REPOSITORY
// in the worker. Only the read path (findByOrganization) is needed here.
//
// IMPORTANT: the worker's pruned production node_modules does NOT resolve a
// direct `mongoose` import (unlike apps/api), so mongoose is taken from
// @novu/dal — which the worker already depends on and which re-exports it.
// decryptApiKey (@novu/application-generic) and class-transformer both resolve
// in the worker, so they are safe to import directly.
export class AiSettingsRepository implements IAiSettingsLookup {
  private readonly model: mongoose.Model<AiSettingsDBModel>;

  constructor() {
    this.model = AiSettings;
  }

  private toObjectId(value: string): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(value);
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
