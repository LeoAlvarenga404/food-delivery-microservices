import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { activeConsumerId, registerConsumer } from '../../../../test/support/consumer.builder.ts';
import { InMemoryConsumerRepository } from '../../../../test/support/in-memory-consumer.repository.ts';
import { GetConsumerQueryHandler } from './get-consumer.query-handler.ts';

const principal = { consumerId: activeConsumerId };

describe('GetConsumerQueryHandler', () => {
  it('returns the snapshot of the registered caller', async () => {
    const consumers = new InMemoryConsumerRepository();
    const registered = registerConsumer();
    await consumers.save(registered);

    const outcome = await new GetConsumerQueryHandler(consumers).execute({ principal });

    expect(outcome).toEqual(right({ ...registered.toSnapshot(), version: 1 }));
  });

  it('reports a caller who has not registered', async () => {
    const outcome = await new GetConsumerQueryHandler(new InMemoryConsumerRepository()).execute({
      principal,
    });

    expect(outcome).toEqual(left({ type: 'ConsumerNotRegistered', consumerId: activeConsumerId }));
  });
});
