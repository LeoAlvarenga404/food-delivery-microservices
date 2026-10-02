import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import { describe, expect, it } from 'vitest';
import { buildReplyMessage } from '../../../../test/support/reply-message.builder.ts';
import { toPlaceOrderSagaReply } from './place-order-saga-reply.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'order.place-order-saga.replies';

describe('place order saga reply golden samples', () => {
  it('reads the ConsumerVerified sample the Consumer service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: ConsumerVerifiedSchema });

    expect(toPlaceOrderSagaReply(buildReplyMessage(ConsumerVerifiedSchema, sample))).toEqual({
      type: 'ConsumerVerified',
    });
  });
});
