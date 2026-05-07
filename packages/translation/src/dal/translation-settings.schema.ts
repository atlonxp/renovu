import { mongoose } from "@novu/dal";

const { Schema } = mongoose;

import type { TranslationSettingsDBModel } from "./translation-settings.entity";

const schemaOptions = {
	timestamps: true,
	id: true,
	toJSON: {
		virtuals: true,
	},
	toObject: { virtuals: true },
};

const translationSettingsSchema = new Schema<TranslationSettingsDBModel>(
	{
		_organizationId: {
			type: Schema.Types.ObjectId,
			ref: "Organization",
			required: true,
			unique: true,
			index: true,
		},
		defaultLocale: {
			type: Schema.Types.String,
			default: "en_US",
			required: true,
		},
		targetLocales: {
			type: [Schema.Types.String],
			default: [],
			required: true,
		},
		localeAliases: {
			type: Schema.Types.Mixed,
			default: {},
		},
	},
	schemaOptions,
);

translationSettingsSchema.index({ _organizationId: 1 }, { unique: true });

export const TranslationSettings =
	(mongoose.models
		.TranslationSettings as mongoose.Model<TranslationSettingsDBModel>) ||
	mongoose.model<TranslationSettingsDBModel>(
		"TranslationSettings",
		translationSettingsSchema,
	);
