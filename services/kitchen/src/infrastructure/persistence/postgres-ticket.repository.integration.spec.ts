import { afterAll, beforeAll, beforeEach } from 'vitest';
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
