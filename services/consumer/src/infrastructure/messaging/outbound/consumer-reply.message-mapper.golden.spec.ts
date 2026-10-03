import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import { describe, it } from 'vitest';
import { activeConsumerId } from '../../../../test/support/consumer.builder.ts';
import { toConsumerVerified } from './consumer-reply.message-mapper.ts';

describe('consumer reply golden samples', () => {
  it('produces the ConsumerVerified sample', async () => {
    await expectGoldenSample(
      {
        directory: goldenSamplesDirectory,
        topic: 'order.place-order-saga.replies',
        schema: ConsumerVerifiedSchema,
      },
      toConsumerVerified({
        type: 'ConsumerVerified',
        consumerId: activeConsumerId,
        orderId: '0199a5d0-0000-7000-8000-0000000000a1',
      }),
    );
  });
});
