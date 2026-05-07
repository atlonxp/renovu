import '../../src/config';

import { NestFactory } from '@nestjs/core';
import { PinoLogger } from '@novu/application-generic';
import { mongoose } from '@novu/dal';

import { AppModule } from '../../src/app.module';

interface LegacyTranslationSettingsDoc {
  _id: mongoose.Types.ObjectId;
  _organizationId: mongoose.Types.ObjectId;
  openaiApiKey?: string;
  openaiModel?: string;
}

/**
 * Moves `openaiApiKey` / `openaiModel` from `translationsettings` rows into
 * the new `aisettings` collection.
 *
 * - Idempotent: skips orgs that already have an `aisettings` row.
 * - Encrypted blobs are portable across collections (same `STORE_ENCRYPTION_KEY`).
 * - Source rows are unset on success so locale data is preserved but stale
 *   AI fields are removed.
 */
export async function moveOpenAiToAiSettingsMigration() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const logger = await app.resolve(PinoLogger);
  logger.setContext('MoveOpenAiToAiSettingsMigration');

  logger.info('start migration - move openai config to ai settings');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection');
  }

  const translationSettingsCollection = db.collection<LegacyTranslationSettingsDoc>('translationsettings');
  const aiSettingsCollection = db.collection<{
    _organizationId: mongoose.Types.ObjectId;
    provider: string;
    apiKey: string;
    model: string;
    createdAt: Date;
    updatedAt: Date;
  }>('aisettings');

  const sourceDocs = await translationSettingsCollection
    .find({ openaiApiKey: { $exists: true, $ne: '' } })
    .toArray();

  let migrated = 0;
  let skipped = 0;
  const total = sourceDocs.length;

  for (const doc of sourceDocs) {
    const orgId = doc._organizationId;

    const existing = await aiSettingsCollection.findOne({ _organizationId: orgId });
    if (existing) {
      logger.info(`org ${orgId.toString()} already has aisettings — skipping`);
      skipped += 1;
      await translationSettingsCollection.updateOne(
        { _id: doc._id },
        { $unset: { openaiApiKey: 1, openaiModel: 1 } }
      );
      continue;
    }

    const now = new Date();
    await aiSettingsCollection.insertOne({
      _organizationId: orgId,
      provider: 'openai',
      apiKey: doc.openaiApiKey ?? '',
      model: doc.openaiModel || 'gpt-4o-mini',
      createdAt: now,
      updatedAt: now,
    });

    await translationSettingsCollection.updateOne(
      { _id: doc._id },
      { $unset: { openaiApiKey: 1, openaiModel: 1 } }
    );

    migrated += 1;
    logger.info(`migrated org ${orgId.toString()}`);
  }

  logger.info(`done. migrated=${migrated} skipped=${skipped} total=${total}`);

  await app.close();
}

if (require.main === module) {
  moveOpenAiToAiSettingsMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
