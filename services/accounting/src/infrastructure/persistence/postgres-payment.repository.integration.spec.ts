import { afterAll, beforeAll, beforeEach } from 'vitest';
import {
  startAccountingTestDatabase,
  type AccountingTestDatabase,
} from '../../../test/support/accounting-database.builder.ts';
import { describePaymentRepositoryContract } from '../../../test/support/payment-repository.contract.ts';
import { PostgresPaymentRepository } from './postgres-payment.repository.ts';

let testDatabase: AccountingTestDatabase;

beforeAll(async () => {
  testDatabase = await startAccountingTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
});

afterAll(async () => {
  await testDatabase.stop();
});

describePaymentRepositoryContract(
  'postgres',
  () => new PostgresPaymentRepository(testDatabase.database),
);
