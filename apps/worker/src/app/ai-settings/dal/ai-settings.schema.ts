import { mongoose } from '@novu/dal';

import { AiProviderEnum, type AiSettingsDBModel } from './ai-settings.entity';

// ReNovu: worker-local mirror of apps/api/src/app/ai-settings/dal/ai-settings.schema.ts.
// Registers the same 'AiSettings' model on the shared mongoose connection so the
// worker can read AI provider settings (used by @novu/translation's
// OpenAITranslationService). The `mongoose.models.AiSettings ||` guard prevents
// OverwriteModelError if the model is ever registered more than once.

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
  id: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
};

const aiSettingsSchema = new Schema<AiSettingsDBModel>(
  {
    _organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: Schema.Types.String,
      enum: Object.values(AiProviderEnum),
      default: AiProviderEnum.OPENAI,
      required: true,
    },
    apiKey: {
      type: Schema.Types.String,
      required: true,
    },
    model: {
      type: Schema.Types.String,
      required: true,
    },
  },
  schemaOptions
);

aiSettingsSchema.index({ _organizationId: 1 }, { unique: true });

export const AiSettings =
  (mongoose.models.AiSettings as mongoose.Model<AiSettingsDBModel>) ||
  mongoose.model<AiSettingsDBModel>('AiSettings', aiSettingsSchema);
