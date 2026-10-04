import {
  ConsumerStatus,
  type GetConsumerResponse,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { z } from 'zod';

export const addressSchema = z.object({
  street: z.string(),
  number: z.string(),
  city: z.string(),
  postalCode: z.string(),
});

export const consumerViewSchema = z.object({
  consumerId: z.uuid(),
  name: z.string(),
  email: z.string(),
  addresses: z.array(addressSchema),
  status: z.enum(['ACTIVE', 'BLOCKED']),
});

export type ConsumerView = z.infer<typeof consumerViewSchema>;

function toStatusName(status: ConsumerStatus): ConsumerView['status'] {
  switch (status) {
    case ConsumerStatus.ACTIVE:
      return 'ACTIVE';
    case ConsumerStatus.BLOCKED:
      return 'BLOCKED';
    case ConsumerStatus.UNSPECIFIED:
      throw new Error('the consumer service answered without a consumer status');
  }
}

export function toConsumerView(consumer: GetConsumerResponse): ConsumerView {
  return {
    consumerId: consumer.consumerId,
    name: consumer.name,
    email: consumer.email,
    addresses: consumer.addresses.map(({ street, number, city, postalCode }) => ({
      street,
      number,
      city,
      postalCode,
    })),
    status: toStatusName(consumer.status),
  };
}
