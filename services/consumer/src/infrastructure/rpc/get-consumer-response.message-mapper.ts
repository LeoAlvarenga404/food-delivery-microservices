import { create } from '@bufbuild/protobuf';
import {
  ConsumerStatus,
  GetConsumerResponseSchema,
  type GetConsumerResponse,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import type {
  ConsumerSnapshot,
  ConsumerStatus as DomainConsumerStatus,
} from '#domain/consumer/consumer.aggregate.ts';

const contractStatusByDomainStatus: Readonly<Record<DomainConsumerStatus, ConsumerStatus>> = {
  ACTIVE: ConsumerStatus.ACTIVE,
  BLOCKED: ConsumerStatus.BLOCKED,
};

export function toGetConsumerResponse(snapshot: ConsumerSnapshot): GetConsumerResponse {
  return create(GetConsumerResponseSchema, {
    consumerId: snapshot.consumerId,
    name: snapshot.name,
    email: snapshot.email,
    addresses: snapshot.addresses.map(({ street, number, city, postalCode }) => ({
      street,
      number,
      city,
      postalCode,
    })),
    status: contractStatusByDomainStatus[snapshot.status],
  });
}
