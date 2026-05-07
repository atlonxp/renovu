import { plainToInstance } from "class-transformer";
import { type Model, Types } from "mongoose";

import {
	type TranslationSettingsDBModel,
	TranslationSettingsEntity,
} from "./translation-settings.entity";
import { TranslationSettings } from "./translation-settings.schema";

export interface UpsertTranslationSettingsInput {
	defaultLocale?: string;
	targetLocales?: string[];
	localeAliases?: Record<string, string>;
}

export class TranslationSettingsRepository {
	private readonly model: Model<TranslationSettingsDBModel>;

	constructor() {
		this.model = TranslationSettings;
	}

	private convertStringToObjectId(value: string): Types.ObjectId {
		return new Types.ObjectId(value);
	}

	private mapEntity(
		data: TranslationSettingsDBModel | null,
	): TranslationSettingsEntity | null {
		if (!data) {
			return null;
		}

		const plain = JSON.parse(JSON.stringify(data));

		return plainToInstance(TranslationSettingsEntity, plain);
	}

	async findByOrganization(
		organizationId: string,
	): Promise<TranslationSettingsEntity | null> {
		const result = await this.model
			.findOne({
				_organizationId: this.convertStringToObjectId(organizationId),
			})
			.lean();

		return this.mapEntity(result as TranslationSettingsDBModel | null);
	}

	async upsertSettings(
		organizationId: string,
		settings: UpsertTranslationSettingsInput,
	): Promise<TranslationSettingsEntity> {
		const updateData: Partial<TranslationSettingsDBModel> = {};

		if (settings.defaultLocale !== undefined) {
			updateData.defaultLocale = settings.defaultLocale;
		}
		if (settings.targetLocales !== undefined) {
			updateData.targetLocales = settings.targetLocales;
		}
		if (settings.localeAliases !== undefined) {
			updateData.localeAliases = settings.localeAliases;
		}

		const result = await this.model.findOneAndUpdate(
			{ _organizationId: this.convertStringToObjectId(organizationId) },
			{ $set: updateData },
			{
				upsert: true,
				new: true,
				setDefaultsOnInsert: true,
			},
		);

		const entity = this.mapEntity(
			result as unknown as TranslationSettingsDBModel,
		);

		if (!entity) {
			throw new Error("Failed to upsert translation settings");
		}

		return entity;
	}

	async deleteByOrganization(organizationId: string): Promise<boolean> {
		const result = await this.model.deleteOne({
			_organizationId: this.convertStringToObjectId(organizationId),
		});

		return result.deletedCount > 0;
	}

	async exists(organizationId: string): Promise<boolean> {
		const count = await this.model.countDocuments({
			_organizationId: this.convertStringToObjectId(organizationId),
		});

		return count > 0;
	}
}
