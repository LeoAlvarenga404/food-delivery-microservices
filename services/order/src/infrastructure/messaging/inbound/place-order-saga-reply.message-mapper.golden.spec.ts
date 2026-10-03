import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { PaymentAuthorizedSchema } from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
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

  it('reads the TicketCreated sample the Kitchen service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: TicketCreatedSchema });

    expect(toPlaceOrderSagaReply(buildReplyMessage(TicketCreatedSchema, sample))).toEqual({
      type: 'TicketCreated',
    });
  });

  it('reads the TicketApproved sample the Kitchen service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: TicketApprovedSchema });

    expect(toPlaceOrderSagaReply(buildReplyMessage(TicketApprovedSchema, sample))).toEqual({
      type: 'TicketApproved',
    });
  });

  it('reads the PaymentAuthorized sample the Accounting service produces', async () => {
    const sample = await readGoldenSample({ directory, topic, schema: PaymentAuthorizedSchema });

    expect(toPlaceOrderSagaReply(buildReplyMessage(PaymentAuthorizedSchema, sample))).toEqual({
      type: 'PaymentAuthorized',
    });
  });
});
