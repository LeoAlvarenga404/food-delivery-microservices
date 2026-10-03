import type { Selectable } from 'kysely';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import { Consumer, type ConsumerStatus } from '#domain/consumer/consumer.aggregate.ts';
import type { Consumers } from './generated/database.ts';

export type ConsumerRow = Selectable<Consumers>;

export const consumerPersistenceMapper = {
  toDomain(row: ConsumerRow): Consumer {
    return Consumer.restore({
      consumerId: row.consumerId as ConsumerId,
      status: row.status as ConsumerStatus,
      version: row.version,
    });
  },

  toPersistence(consumer: Consumer): ConsumerRow {
    const { consumerId, status, version } = consumer.toSnapshot();
    return { consumerId, status, version };
  },
};
