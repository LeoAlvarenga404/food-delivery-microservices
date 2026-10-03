import type { Either } from '@fd/domain';
import { parseConsumerId, type ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import { Consumer, type ConsumerSnapshot } from '#domain/consumer/consumer.aggregate.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const activeConsumerId: ConsumerId = unwrap(
  parseConsumerId('0199a5d0-0000-7000-8000-0000000000c1'),
);

export function buildConsumer(overrides: Partial<ConsumerSnapshot> = {}): Consumer {
  return Consumer.restore({
    consumerId: activeConsumerId,
    status: 'ACTIVE',
    version: 1,
    ...overrides,
  });
}
