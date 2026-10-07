import { create } from '@bufbuild/protobuf';
import {
  ConsumerStatus,
  GetConsumerResponseSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';
import { describe, expect, it } from 'vitest';
import {
  activeConsumerId,
  buildConsumer,
  homeAddress,
  workAddress,
} from '../../../test/support/consumer.builder.ts';
import { toGetConsumerResponse } from './get-consumer-response.message-mapper.ts';

describe('toGetConsumerResponse', () => {
  it('answers the profile of a consumer with every address', () => {
    const snapshot = buildConsumer({ addresses: [homeAddress, workAddress] }).toSnapshot();

    expect(toGetConsumerResponse(snapshot)).toEqual(
      create(GetConsumerResponseSchema, {
        consumerId: activeConsumerId,
        name: 'Ana Souza',
        email: 'ana.souza@food-delivery.test',
        addresses: [homeAddress, workAddress],
        status: ConsumerStatus.ACTIVE,
      }),
    );
  });

  it('answers a blocked consumer as blocked', () => {
    const snapshot = buildConsumer({ status: 'BLOCKED' }).toSnapshot();

    expect(toGetConsumerResponse(snapshot).status).toBe(ConsumerStatus.BLOCKED);
  });
});
