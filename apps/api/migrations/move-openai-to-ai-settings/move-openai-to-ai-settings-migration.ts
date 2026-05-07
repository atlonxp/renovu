import '../../src/config';

import { NestFactory } from '@nestjs/core';
import { PinoLogger } from '@novu/application-generic';
import { mongoose } from '@novu/dal';

import { AppModule } from '../../src/app.module';
import { moveOpenAiToAiSettingsCore } from '../../src/migrations-runtime/move-openai-to-ai-settings/core';

/**
 * CLI entrypoint — boots the full Nest app, runs the core, exits.
 *
 * In production, the same migration runs automatically on API startup via
 * `apps/api/src/migrations-runtime/run-pending-migrations.ts`. Use this CLI
 * only for ad-hoc backfills or local dev runs.
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

  const { migrated, skipped, total } = await moveOpenAiToAiSettingsCore(db, logger);

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
