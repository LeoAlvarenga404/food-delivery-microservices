import type { InboundMessage } from '@fd/chassis-kafka';
import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer, type StartedPostgres } from '@fd/chassis-testing';
import { sql, type Kysely, type Transaction } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inboxMigrations } from './inbox-migrations.ts';
import { withInbox } from './with-inbox.ts';

interface TicketsTable {
  readonly ticketId: string;
}

interface InboxTable {
  readonly messageId: string;
  readonly handlerName: string;
  readonly processedAt: Date;
}

interface KitchenSchema {
  readonly tickets: TicketsTable;
  readonly inbox: InboxTable;
}

const processedAt = new Date('2026-10-01T12:00:00.000Z');

let postgres: StartedPostgres;
let database: Kysely<KitchenSchema>;

function inboundMessage(messageId: string): InboundMessage {
  return {
    topic: 'kitchen.commands',
    partition: 0,
    offset: '0',
    key: 'order-1',
    payload: new Uint8Array(),
    headers: {
      messageId,
      messageType: 'fooddelivery.kitchen.v1.CreateTicket',
      correlationId: '0192a1b2-0000-7000-8000-0000000000c1',
      causationId: undefined,
      sagaId: undefined,
      traceparent: undefined,
      actorId: undefined,
      actorType: undefined,
    },
  };
}

function createTicketHandler(handlerName: string, calls: string[]) {
  return withInbox<KitchenSchema>(
    { database, handlerName, now: () => processedAt },
    async (message, transaction: Transaction<KitchenSchema>) => {
      calls.push(message.headers.messageId);
      await transaction
        .insertInto('tickets')
        .values({ ticketId: `ticket-${String(calls.length)}` })
        .execute();
    },
  );
}

async function countRows(table: 'tickets' | 'inbox'): Promise<number> {
  const rows = await database.selectFrom(table).selectAll().execute();
  return rows.length;
}

beforeAll(async () => {
  postgres = await startPostgresContainer();
  database = createDatabase<KitchenSchema>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 2,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, [inboxMigrations]);
  await sql`create table tickets (ticket_id text primary key)`.execute(database);
});

beforeEach(async () => {
  await sql`truncate tickets, inbox`.execute(database);
});

afterAll(async () => {
  await database.destroy();
  await postgres.stop();
});

describe('withInbox', () => {
  it('runs the handler once per message and records the delivery in the same transaction', async () => {
    const calls: string[] = [];
    const handle = createTicketHandler('create-ticket', calls);
    const message = inboundMessage('0192a1b2-0000-7000-8000-000000000001');

    await handle(message);
    await handle(message);

    expect(calls).toEqual(['0192a1b2-0000-7000-8000-000000000001']);
    expect(await countRows('tickets')).toBe(1);
    expect(await database.selectFrom('inbox').selectAll().execute()).toEqual([
      {
        messageId: '0192a1b2-0000-7000-8000-000000000001',
        handlerName: 'create-ticket',
        processedAt,
      },
    ]);
  });

  it('lets another handler process the same message independently', async () => {
    const calls: string[] = [];
    const message = inboundMessage('0192a1b2-0000-7000-8000-000000000002');

    await createTicketHandler('create-ticket', calls)(message);
    await createTicketHandler('notify-kitchen', calls)(message);

    expect(calls).toHaveLength(2);
    expect(await countRows('inbox')).toBe(2);
  });

  it('rolls back the delivery record and the handler writes when the handler throws', async () => {
    const message = inboundMessage('0192a1b2-0000-7000-8000-000000000003');
    const failing = withInbox<KitchenSchema>(
      { database, handlerName: 'create-ticket', now: () => processedAt },
      async (inbound, transaction) => {
        await transaction.insertInto('tickets').values({ ticketId: 'ticket-1' }).execute();
        throw new Error(`could not handle ${inbound.headers.messageId}`);
      },
    );

    await expect(failing(message)).rejects.toThrow('could not handle');
    expect(await countRows('tickets')).toBe(0);
    expect(await countRows('inbox')).toBe(0);

    const calls: string[] = [];
    await createTicketHandler('create-ticket', calls)(message);
    expect(calls).toHaveLength(1);
  });
});
