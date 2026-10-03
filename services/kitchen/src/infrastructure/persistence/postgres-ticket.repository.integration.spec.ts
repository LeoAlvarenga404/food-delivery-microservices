import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startKitchenTestDatabase,
  type KitchenTestDatabase,
} from '../../../test/support/kitchen-database.builder.ts';
import { describeTicketRepositoryContract } from '../../../test/support/ticket-repository.contract.ts';
import { PostgresTicketRepository } from './postgres-ticket.repository.ts';

let testDatabase: KitchenTestDatabase;

beforeAll(async () => {
  testDatabase = await startKitchenTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeTicketRepositoryContract(
  'postgres',
  () => new PostgresTicketRepository(testDatabase.database),
);

describe('postgres tickets table', () => {
  it('rejects a ticket without line items', async () => {
    const insertion = sql`
      insert into tickets (ticket_id, order_id, restaurant_id, line_items, status, version)
      values (
        '0199a5d0-0000-7000-8000-0000000000a1',
        '0199a5d0-0000-7000-8000-0000000000a2',
        '0199a5d0-0000-7000-8000-0000000000a3',
        '[]'::jsonb,
        'CREATE_PENDING',
        1
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });
});
