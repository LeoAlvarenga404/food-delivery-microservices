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
      insert into tickets (ticket_id, order_id, restaurant_id, consumer_id, line_items, status, version)
      values (
        '0199a5d0-0000-7000-8000-0000000000a1',
        '0199a5d0-0000-7000-8000-0000000000a2',
        '0199a5d0-0000-7000-8000-0000000000a3',
        '0199a5d0-0000-7000-8000-0000000000a4',
        '[]'::jsonb,
        'CREATE_PENDING',
        1
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });

  it.each([
    { scenario: 'an accepted ticket without times', status: 'ACCEPTED', times: 'null, null' },
    {
      scenario: 'an accepted ticket without its ready-by time',
      status: 'ACCEPTED',
      times: 'now(), null',
    },
    {
      scenario: 'a pending ticket with acceptance times',
      status: 'AWAITING_ACCEPTANCE',
      times: 'now(), now()',
    },
  ])('rejects $scenario', async ({ status, times }) => {
    const insertion = sql`
      insert into tickets (
        ticket_id, order_id, restaurant_id, consumer_id, line_items, status, accepted_at, ready_by, version
      )
      values (
        '0199a5d0-0000-7000-8000-0000000000a1',
        '0199a5d0-0000-7000-8000-0000000000a2',
        '0199a5d0-0000-7000-8000-0000000000a3',
        '0199a5d0-0000-7000-8000-0000000000a4',
        '[{"menuItemId": "0199a5d0-0000-7000-8000-000000000101", "name": "Pizza", "quantity": 1}]'::jsonb,
        ${status},
        ${sql.raw(times)},
        1
      )
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });
});
