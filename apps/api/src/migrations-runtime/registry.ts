import type { Db } from 'mongodb';

import { moveOpenAiToAiSettingsCore } from './move-openai-to-ai-settings/core';

interface MigrationLogger {
  info: (msg: string) => void;
  error?: (msg: string) => void;
}

export interface RegisteredMigration {
  /**
   * Stable identifier used as the `_id` in the `_renovu_migrations` tracking
   * collection. Never rename — that would re-run a migration that already ran.
   */
  name: string;
  /** Pure logic. Takes a connected Db. Idempotent — re-running must be a no-op. */
  run: (db: Db, logger: MigrationLogger) => Promise<unknown>;
}

/**
 * Migrations registered here are run automatically on API startup, in order,
 * exactly once per cluster. New migrations are appended; do NOT reorder or
 * rename existing entries.
 */
export const MIGRATION_REGISTRY: RegisteredMigration[] = [
  {
    name: 'move-openai-to-ai-settings',
    run: moveOpenAiToAiSettingsCore,
  },
];
