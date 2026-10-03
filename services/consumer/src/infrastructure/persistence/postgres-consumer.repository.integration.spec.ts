import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startConsumerTestDatabase,
  type ConsumerTestDatabase,
} from '../../../test/support/consumer-database.builder.ts';
import { describeConsumerRepositoryContract } from '../../../test/support/consumer-repository.contract.ts';
import { activeConsumerId } from '../../../test/support/consumer.builder.ts';
import { PostgresConsumerRepository } from './postgres-consumer.repository.ts';

let testDatabase: ConsumerTestDatabase;

beforeAll(async () => {
  testDatabase = await startConsumerTestDatabase();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeConsumerRepositoryContract('postgres', async (storedConsumers) => {
  await testDatabase.storeConsumers(storedConsumers);
  return new PostgresConsumerRepository(testDatabase.database);
});

describe('postgres consumer repository seed', () => {
  it('finds the active consumer the migrations seed for the walking skeleton', async () => {
    const consumers = new PostgresConsumerRepository(testDatabase.database);

    const seeded = await consumers.findById(activeConsumerId);

    expect(seeded?.toSnapshot()).toEqual({
      consumerId: activeConsumerId,
      status: 'ACTIVE',
      version: 1,
    });
  });
});
