import { beforeEach, describe, expect, it } from 'vitest';
import { parseConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import type { ConsumerRepository } from '#domain/consumer/consumer.repository.ts';
import { buildConsumer, unwrap } from './consumer.builder.ts';

const blockedConsumerId = unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000c2'));

export function describeConsumerRepositoryContract(
  implementationName: string,
  createRepository: (storedConsumers: readonly Consumer[]) => Promise<ConsumerRepository>,
): void {
  describe(`${implementationName} consumer repository`, () => {
    const blockedConsumer = buildConsumer({ consumerId: blockedConsumerId, status: 'BLOCKED' });
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
  });
}
