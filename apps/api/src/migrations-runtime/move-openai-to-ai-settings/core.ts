import type { Db } from 'mongodb';
import type { Types } from 'mongoose';

interface LegacyTranslationSettingsDoc {
  _id: Types.ObjectId;
  _organizationId: Types.ObjectId;
  openaiApiKey?: string;
  openaiModel?: string;
}

interface MigrationLogger {
  info: (msg: string) => void;
  error?: (msg: string) => void;
}

/**
 * Pure migration logic — takes an open Mongo Db handle and runs the work.
 * Used by both the CLI entrypoint (manual `pnpm migration ...`) and the
 * on-startup migration runner.
 *
 * - Idempotent: skips orgs that already have an `aisettings` row.
 * - Encrypted blobs are portable across collections (same `STORE_ENCRYPTION_KEY`).
 * - Source rows have stale OpenAI fields unset on success so locale data is
 *   preserved.
 */
export async function moveOpenAiToAiSettingsCore(
  db: Db,
  logger: MigrationLogger
): Promise<{ migrated: number; skipped: number; total: number }> {
  const translationSettingsCollection = db.collection<LegacyTranslationSettingsDoc>('translationsettings');
  const aiSettingsCollection = db.collection<{
    _organizationId: Types.ObjectId;
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

  return { migrated, skipped, total };
}
