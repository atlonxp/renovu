import type { Db } from 'mongodb';

import { MIGRATION_REGISTRY, type RegisteredMigration } from './registry';

const TRACKING_COLLECTION = '_renovu_migrations';
const LOCK_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const LOCK_POLL_INTERVAL_MS = 2000;
const STALE_LOCK_THRESHOLD_MS = 10 * 60 * 1000;

interface MigrationLogger {
  info: (msg: string) => void;
  warn?: (msg: string) => void;
  error: (msg: string) => void;
}

interface MigrationDoc {
  _id: string;
  status: 'running' | 'applied' | 'failed';
  startedAt?: Date;
  appliedAt?: Date;
  failedAt?: Date;
  error?: string;
  hostname?: string;
}

/**
 * Run every pending migration from the registry. Safe across multiple replicas:
 * the first replica to insert a `running` row wins the lock; others poll the
 * tracking collection until the leader updates `status` to `applied`.
 *
 * If a migration crashes the leader and leaves a stale `running` row, replicas
 * starting more than `STALE_LOCK_THRESHOLD_MS` later will reclaim it. This is
 * deliberately generous (10 minutes) — we'd rather waste a few minutes than
 * risk two replicas concurrently re-running a half-applied migration.
 */
export async function runPendingMigrations(
  db: Db,
  logger: MigrationLogger,
  registry: RegisteredMigration[] = MIGRATION_REGISTRY
): Promise<void> {
  const col = db.collection<MigrationDoc>(TRACKING_COLLECTION);

  for (const migration of registry) {
    await runOne(col, migration, db, logger);
  }
}

async function runOne(
  col: ReturnType<Db['collection']>,
  migration: RegisteredMigration,
  db: Db,
  logger: MigrationLogger
): Promise<void> {
  const existing = (await col.findOne({ _id: migration.name as never })) as MigrationDoc | null;

  if (existing?.status === 'applied') {
    logger.info(`migration ${migration.name}: already applied — skipping`);

    return;
  }

  if (existing?.status === 'running') {
    const startedAt = existing.startedAt?.getTime() ?? 0;
    const ageMs = Date.now() - startedAt;
    if (ageMs > STALE_LOCK_THRESHOLD_MS) {
      logger.warn?.(
        `migration ${migration.name}: prior run stale (${Math.round(ageMs / 1000)}s old) — reclaiming lock`
      );
      await col.deleteOne({ _id: migration.name as never });
    } else {
      await waitForLeader(col, migration.name, logger);

      return;
    }
  }

  if (existing?.status === 'failed') {
    logger.warn?.(
      `migration ${migration.name}: prior run failed (${existing.error ?? 'unknown'}) — retrying`
    );
    await col.deleteOne({ _id: migration.name as never });
  }

  let acquired = false;
  try {
    await col.insertOne({
      _id: migration.name,
      status: 'running',
      startedAt: new Date(),
      hostname: process.env.HOSTNAME ?? 'unknown',
    } as MigrationDoc);
    acquired = true;
  } catch (err: unknown) {
    if ((err as { code?: number }).code !== 11000) {
      throw err;
    }
  }

  if (!acquired) {
    logger.info(`migration ${migration.name}: lock held by another replica — waiting`);
    await waitForLeader(col, migration.name, logger);

    return;
  }

  try {
    logger.info(`migration ${migration.name}: starting`);
    await migration.run(db, logger);
    await col.updateOne(
      { _id: migration.name as never },
      { $set: { status: 'applied', appliedAt: new Date() } }
    );
    logger.info(`migration ${migration.name}: applied`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await col.updateOne(
      { _id: migration.name as never },
      { $set: { status: 'failed', failedAt: new Date(), error: msg } }
    );
    logger.error(`migration ${migration.name}: failed — ${msg}`);
    throw err;
  }
}

async function waitForLeader(
  col: ReturnType<Db['collection']>,
  name: string,
  logger: MigrationLogger
): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const doc = (await col.findOne({ _id: name as never })) as MigrationDoc | null;
    if (doc?.status === 'applied') {
      logger.info(`migration ${name}: applied by leader`);

      return;
    }
    if (doc?.status === 'failed') {
      throw new Error(`Migration ${name} failed in another replica: ${doc.error ?? 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for migration ${name} to complete on another replica`);
}
