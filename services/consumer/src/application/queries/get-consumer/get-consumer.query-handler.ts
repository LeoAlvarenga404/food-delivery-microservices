import { left, right, type Either } from '@fd/domain';
import type { ConsumerSnapshot } from '#domain/consumer/consumer.aggregate.ts';
import type { ConsumerRepository } from '#domain/consumer/consumer.repository.ts';
import type { ConsumerNotRegistered, GetConsumerQuery } from './get-consumer.query.ts';

export class GetConsumerQueryHandler {
  readonly #consumers: ConsumerRepository;

  constructor(consumers: ConsumerRepository) {
    this.#consumers = consumers;
  }

  async execute(query: GetConsumerQuery): Promise<Either<ConsumerNotRegistered, ConsumerSnapshot>> {
    const { consumerId } = query.principal;
    const consumer = await this.#consumers.findById(consumerId);
    if (consumer === undefined) return left({ type: 'ConsumerNotRegistered', consumerId });
    return right(consumer.toSnapshot());
  }
}
