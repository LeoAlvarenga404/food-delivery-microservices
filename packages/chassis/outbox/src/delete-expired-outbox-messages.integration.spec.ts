import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer, type StartedPostgres } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteExpiredOutboxMessages } from './delete-expired-outbox-messages.ts';
import { outboxMigrations } from './outbox-migrations.ts';

const now = new Date('2026-10-03T12:00:00.000Z');
const oneDayInMilliseconds = 86_400_000;
const expiredMessageId = '0199a5d0-0000-7000-8000-000000000e01';
const oneDayOldMessageId = '0199a5d0-0000-7000-8000-000000000e02';
const freshMessageId = '0199a5d0-0000-7000-8000-000000000e03';

let postgres: StartedPostgres;
let database: Kysely<unknown>;

async function insertOutboxMessage(messageId: string, ageInMilliseconds: number): Promise<void> {
  const occurredAt = new Date(now.getTime() - ageInMilliseconds);
  await sql`
    insert into outbox (
      id, topic, aggregate_type, aggregate_id, message_type, payload, correlation_id, occurred_at
    ) values (
      ${messageId}, 'order.order.events', 'Order', '0199a5d0-0000-7000-8000-0000000000a1',
      'fooddelivery.order.v1.OrderPlaced', ${Buffer.from([])},
      '0199a5d0-0000-7000-8000-0000000000e1', ${occurredAt}
    )
  `.execute(database);
}

beforeAll(async () => {
  postgres = await startPostgresContainer();
  database = createDatabase({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 2,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, [outboxMigrations]);
});

afterAll(async () => {
  await database.destroy();
  await postgres.stop();
});

describe('deleteExpiredOutboxMessages', () => {
  it('deletes the messages older than one day and keeps the others', async () => {
    await insertOutboxMessage(expiredMessageId, oneDayInMilliseconds + 1);
    await insertOutboxMessage(oneDayOldMessageId, oneDayInMilliseconds);
    await insertOutboxMessage(freshMessageId, 1_000);

    const deletedCount = await deleteExpiredOutboxMessages(database, now);

    const remaining = await sql<{ readonly id: string }>`select id from outbox order by id`.execute(
      database,
    );
    expect(deletedCount).toBe(1);
    expect(remaining.rows.map((row) => row.id)).toEqual([oneDayOldMessageId, freshMessageId]);
  });
});
