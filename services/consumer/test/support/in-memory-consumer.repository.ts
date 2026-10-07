import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import type { ConsumerRepository } from '#domain/consumer/consumer.repository.ts';
import {
  consumerPersistenceMapper,
  type ConsumerRow,
} from '#infrastructure/persistence/consumer.persistence-mapper.ts';

export class InMemoryConsumerRepository implements ConsumerRepository {
  readonly #rows = new Map<string, ConsumerRow>();

  constructor(storedConsumers: readonly Consumer[] = []) {
    for (const consumer of storedConsumers) {
      const row = consumerPersistenceMapper.toPersistence(consumer);
      this.#rows.set(row.consumerId, row);
    }
  }

  findById(consumerId: ConsumerId): Promise<Consumer | undefined> {
    const row = this.#rows.get(consumerId);
    return Promise.resolve(row === undefined ? undefined : consumerPersistenceMapper.toDomain(row));
  }

  save(consumer: Consumer): Promise<void> {
    const row = consumerPersistenceMapper.toPersistence(consumer);
    if ((this.#rows.get(row.consumerId)?.version ?? 0) !== row.version) {
      return Promise.reject(new ConcurrencyConflictError(`consumer ${row.consumerId} changed`));
    }
    this.#rows.set(row.consumerId, { ...row, version: row.version + 1 });
    return Promise.resolve();
  }
}
