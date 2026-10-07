import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import type { ConsumerRepository } from '#domain/consumer/consumer.repository.ts';
import { consumerPersistenceMapper, type ConsumerRow } from './consumer.persistence-mapper.ts';
import type { DB as ConsumerDatabase } from './generated/database.ts';

export class PostgresConsumerRepository implements ConsumerRepository {
  readonly #database: Kysely<ConsumerDatabase>;

  constructor(database: Kysely<ConsumerDatabase>) {
    this.#database = database;
  }

  async findById(consumerId: ConsumerId): Promise<Consumer | undefined> {
    const row = await this.#database
      .selectFrom('consumers')
      .selectAll()
      .where('consumerId', '=', consumerId)
      .executeTakeFirst();
    return row === undefined ? undefined : consumerPersistenceMapper.toDomain(row);
  }

  async save(consumer: Consumer): Promise<void> {
    const row = consumerPersistenceMapper.toPersistence(consumer);
    if (row.version === 0) {
      await this.#insert(row);
      return;
    }
    await this.#update(row);
  }

  async #insert(row: ConsumerRow): Promise<void> {
    await this.#database
      .insertInto('consumers')
      .values({ ...row, addresses: JSON.stringify(row.addresses), version: 1 })
      .execute()
      .catch((error: unknown) => {
        throw ConcurrencyConflictError.fromUniqueViolation(
          error,
          `consumer ${row.consumerId} already exists`,
        );
      });
  }

  async #update(row: ConsumerRow): Promise<void> {
    const { consumerId, name, email, addresses, status, version } = row;
    const result = await this.#database
      .updateTable('consumers')
      .set({ name, email, addresses: JSON.stringify(addresses), status, version: version + 1 })
      .where('consumerId', '=', consumerId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(
        `consumer ${consumerId} changed after version ${String(version)}`,
      );
    }
  }
}
