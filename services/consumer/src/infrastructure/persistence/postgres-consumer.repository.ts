import type { Kysely } from 'kysely';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import type { ConsumerRepository } from '#domain/consumer/consumer.repository.ts';
import { consumerPersistenceMapper } from './consumer.persistence-mapper.ts';
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
}
