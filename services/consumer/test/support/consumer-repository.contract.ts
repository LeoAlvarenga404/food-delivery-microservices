import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import type { ConsumerRepository } from '#domain/consumer/consumer.repository.ts';
import {
  activeConsumerId,
  buildConsumer,
  homeAddress,
  registerConsumer,
  unwrap,
  workAddress,
} from './consumer.builder.ts';

const blockedConsumerId = unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000c2'));

async function findStoredConsumer(consumers: ConsumerRepository): Promise<Consumer> {
  const consumer = await consumers.findById(activeConsumerId);
  if (consumer === undefined) throw new Error('the registered consumer was not stored');
  return consumer;
}

export function describeConsumerRepositoryContract(
  implementationName: string,
  createRepository: (storedConsumers: readonly Consumer[]) => Promise<ConsumerRepository>,
): void {
  describe(`${implementationName} consumer repository`, () => {
    const blockedConsumer = buildConsumer({
      consumerId: blockedConsumerId,
      status: 'BLOCKED',
      version: 3,
    });
    let consumers: ConsumerRepository;

    beforeEach(async () => {
      consumers = await createRepository([blockedConsumer]);
    });

    it('finds a stored consumer with its status and version', async () => {
      const found = await consumers.findById(blockedConsumerId);

      expect(found?.toSnapshot()).toEqual(blockedConsumer.toSnapshot());
    });

    it('returns undefined for a consumer that was never stored', async () => {
      const unknownConsumerId = unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000cf'));

      expect(await consumers.findById(unknownConsumerId)).toBeUndefined();
    });

    it('saves a registered consumer with its name, email and addresses at version one', async () => {
      const registered = registerConsumer({ addresses: [homeAddress, workAddress] });

      await consumers.save(registered);

      expect((await findStoredConsumer(consumers)).toSnapshot()).toEqual({
        ...registered.toSnapshot(),
        version: 1,
      });
    });

    it('saves a stored consumer again with every field and the next version', async () => {
      await consumers.save(registerConsumer());
      const stored = (await findStoredConsumer(consumers)).toSnapshot();
      const changed = Consumer.restore({ ...stored, addresses: [workAddress], status: 'BLOCKED' });

      await consumers.save(changed);

      expect((await findStoredConsumer(consumers)).toSnapshot()).toEqual({
        ...changed.toSnapshot(),
        version: 2,
      });
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await consumers.save(registerConsumer());
      const stored = await findStoredConsumer(consumers);
      await consumers.save(stored);

      await expect(consumers.save(stored)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses a new consumer whose id is already stored as a concurrency conflict', async () => {
      await consumers.save(registerConsumer());

      await expect(consumers.save(registerConsumer())).rejects.toThrow(ConcurrencyConflictError);
    });
  });
}
