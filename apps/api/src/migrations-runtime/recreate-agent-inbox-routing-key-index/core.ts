import { AGENT_INBOX_ROUTING_KEY_PARTIAL_FILTER } from '@novu/dal';
import type { mongo } from 'mongoose';

type Db = mongo.Db;

interface MigrationLogger {
  info: (msg: string) => void;
  error?: (msg: string) => void;
}

interface RoutingKeyIndex {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

const AGENT_INBOX_ROUTING_KEY_INDEX = 'credentials.inboxRoutingKey_1';

/**
 * Runtime copy of upstream's manual migration
 * `apps/api/migrations/agent-email-inbox-routing-key-index` (that folder is not in the build output).
 *
 * Upstream widened the partial filter of the integrations routing-key index. MongoDB cannot change a
 * partial filter in place (IndexOptionsConflict 85), so autoIndex alone leaves the old definition and
 * logs a conflict on every boot. Drop and recreate it; restore the previous index if the rebuild fails.
 *
 * Idempotent: returns early when the index already has the expected filter.
 */
function isTargetRoutingKeyIndex(index: RoutingKeyIndex): boolean {
  if (index.unique === false) {
    return false;
  }

  const filter = index.partialFilterExpression as
    | { providerId?: { $in?: string[] }; 'credentials.inboxRoutingKey'?: { $type?: string } }
    | undefined;
  const actual = filter?.providerId?.$in;
  if (!actual || filter?.['credentials.inboxRoutingKey']?.$type !== 'string') {
    return false;
  }

  const expected = [...AGENT_INBOX_ROUTING_KEY_PARTIAL_FILTER.providerId.$in].sort();
  const providers = [...actual].sort();

  return providers.length === expected.length && providers.every((providerId, i) => providerId === expected[i]);
}

export async function recreateAgentInboxRoutingKeyIndexCore(
  db: Db,
  logger: MigrationLogger
): Promise<{ recreated: boolean }> {
  const collection = db.collection('integrations');
  const indexes = (await collection.indexes()) as RoutingKeyIndex[];
  const existing = indexes.find((index) => index.key?.['credentials.inboxRoutingKey'] === 1);

  if (existing && isTargetRoutingKeyIndex(existing)) {
    logger.info('routing-key index already up to date');

    return { recreated: false };
  }

  if (existing?.name) {
    await collection.dropIndex(existing.name);
  }

  try {
    await collection.createIndex(
      { 'credentials.inboxRoutingKey': 1 },
      {
        unique: true,
        name: AGENT_INBOX_ROUTING_KEY_INDEX,
        partialFilterExpression: { ...AGENT_INBOX_ROUTING_KEY_PARTIAL_FILTER },
      }
    );
  } catch (error) {
    if (existing?.name) {
      await collection.createIndex(
        { 'credentials.inboxRoutingKey': 1 },
        {
          unique: existing.unique !== false,
          name: existing.name,
          ...(existing.partialFilterExpression ? { partialFilterExpression: existing.partialFilterExpression } : {}),
        }
      );
    }

    throw error;
  }

  logger.info('routing-key index recreated with the widened partial filter');

  return { recreated: true };
}
