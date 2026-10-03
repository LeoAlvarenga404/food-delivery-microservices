import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerifiedSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import { describe, it } from 'vitest';
import { activeConsumerId } from '../../../../test/support/consumer.builder.ts';
import {
  toConsumerVerificationFailed,
  toConsumerVerified,
} from './consumer-reply.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'order.place-order-saga.replies';
const orderId = '0199a5d0-0000-7000-8000-0000000000a1';

describe('consumer reply golden samples', () => {
  it('produces the ConsumerVerified sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: ConsumerVerifiedSchema },
      toConsumerVerified({ type: 'ConsumerVerified', consumerId: activeConsumerId, orderId }),
    );
  });

  it('produces the ConsumerVerificationFailed sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: ConsumerVerificationFailedSchema },
      toConsumerVerificationFailed({
        type: 'ConsumerVerificationFailed',
        consumerId: activeConsumerId,
        orderId,
        reason: 'ConsumerNotFound',
      }),
    );
  });
});
