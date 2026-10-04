import type { Selectable } from 'kysely';
import type { Address } from '#domain/consumer/address.value-object.ts';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { ConsumerName } from '#domain/consumer/consumer-name.value-object.ts';
import { Consumer, type ConsumerStatus } from '#domain/consumer/consumer.aggregate.ts';
import type { Email } from '#domain/consumer/email.value-object.ts';
import type { Consumers } from './generated/database.ts';

export type ConsumerRow = Selectable<Consumers>;

export const consumerPersistenceMapper = {
  toDomain(row: ConsumerRow): Consumer {
    return Consumer.restore({
      consumerId: row.consumerId as ConsumerId,
      name: row.name as ConsumerName,
      email: row.email as Email,
      addresses: row.addresses as unknown as readonly Address[],
      status: row.status as ConsumerStatus,
      version: row.version,
    });
  },

  toPersistence(consumer: Consumer): ConsumerRow {
    const { consumerId, name, email, addresses, status, version } = consumer.toSnapshot();
    return {
      consumerId,
      name,
      email,
      addresses: addresses.map(({ street, number, city, postalCode }) => ({
        street,
        number,
        city,
        postalCode,
      })),
      status,
      version,
    };
  },
};
