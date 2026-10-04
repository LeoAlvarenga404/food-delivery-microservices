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

describe('postgres consumer repository migrations', () => {
  it('leave no seeded consumer, so every consumer registers itself', async () => {
    const consumers = new PostgresConsumerRepository(testDatabase.database);

    expect(await consumers.findById(activeConsumerId)).toBeUndefined();
  });
});

describeConsumerRepositoryContract('postgres', async (storedConsumers) => {
  await testDatabase.replaceConsumers(storedConsumers);
  return new PostgresConsumerRepository(testDatabase.database);
});
