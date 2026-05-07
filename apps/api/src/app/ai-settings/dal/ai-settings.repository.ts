import { decryptApiKey, encryptApiKey } from '@novu/application-generic';
import { plainToInstance } from 'class-transformer';
import { type Model, Types } from 'mongoose';

import { type AiProviderEnum, type AiSettingsDBModel, AiSettingsEntity } from './ai-settings.entity';
import { AiSettings } from './ai-settings.schema';

export interface UpsertAiSettingsInput {
  provider?: AiProviderEnum;
  apiKey?: string;
  model?: string;
}

export class AiSettingsRepository {
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

  async upsertSettings(organizationId: string, settings: UpsertAiSettingsInput): Promise<AiSettingsEntity> {
    const updateData: Partial<AiSettingsDBModel> = {};

    if (settings.apiKey !== undefined) {
      updateData.apiKey = encryptApiKey(settings.apiKey);
    }
    if (settings.provider !== undefined) {
      updateData.provider = settings.provider;
    }
    if (settings.model !== undefined) {
      updateData.model = settings.model;
    }

    const result = await this.model.findOneAndUpdate(
      { _organizationId: this.toObjectId(organizationId) },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const entity = this.mapEntity(result as unknown as AiSettingsDBModel);
    if (!entity) {
      throw new Error('Failed to upsert AI settings');
    }

    return entity;
  }

  async deleteByOrganization(organizationId: string): Promise<boolean> {
    const result = await this.model.deleteOne({ _organizationId: this.toObjectId(organizationId) });

    return result.deletedCount > 0;
  }

  async exists(organizationId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ _organizationId: this.toObjectId(organizationId) });

    return count > 0;
  }
}
