import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer, type StartedPostgres } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteExpiredInboxEntries } from './delete-expired-inbox-entries.ts';
import { inboxMigrations } from './inbox-migrations.ts';

const now = new Date('2026-10-03T12:00:00.000Z');
const thirtyDaysInMilliseconds = 2_592_000_000;
const expiredMessageId = '0199a5d0-0000-7000-8000-000000000d01';
const otherExpiredMessageId = '0199a5d0-0000-7000-8000-000000000d04';
const thirtyDaysOldMessageId = '0199a5d0-0000-7000-8000-000000000d02';
const freshMessageId = '0199a5d0-0000-7000-8000-000000000d03';

let postgres: StartedPostgres;
let database: Kysely<unknown>;

async function insertInboxEntry(messageId: string, ageInMilliseconds: number): Promise<void> {
  const processedAt = new Date(now.getTime() - ageInMilliseconds);
  await sql`
    insert into inbox (message_id, handler_name, processed_at)
    values (${messageId}, 'kitchen-command', ${processedAt})
  `.execute(database);
}

beforeAll(async () => {
  postgres = await startPostgresContainer();
  database = createDatabase({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 2,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, [inboxMigrations]);
});

afterAll(async () => {
  await database.destroy();
  await postgres.stop();
});

describe('deleteExpiredInboxEntries', () => {
  it('deletes the entries older than thirty days and keeps the others', async () => {
    await insertInboxEntry(expiredMessageId, thirtyDaysInMilliseconds + 1);
    await insertInboxEntry(otherExpiredMessageId, thirtyDaysInMilliseconds + 2);
    await insertInboxEntry(thirtyDaysOldMessageId, thirtyDaysInMilliseconds);
    await insertInboxEntry(freshMessageId, 1_000);

    const deletedCount = await deleteExpiredInboxEntries(database, now);

    const remaining = await sql<{ readonly messageId: string }>`
      select message_id from inbox order by message_id
    `.execute(database);
    expect(deletedCount).toBe(2);
    expect(remaining.rows.map((row) => row.messageId)).toEqual([
      thirtyDaysOldMessageId,
      freshMessageId,
    ]);
  });
});
