import { PermanentMessageFailure } from '@fd/chassis-kafka';
import { PaymentAuthorizedSchema } from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { ConsumerVerifiedSchema } from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { describe, expect, it } from 'vitest';
import { buildReplyMessage } from '../../../../test/support/reply-message.builder.ts';
import { toPlaceOrderSagaReply } from './place-order-saga-reply.message-mapper.ts';

const orderId = '0199a5d0-0000-7000-8000-0000000000a1';

describe('toPlaceOrderSagaReply', () => {
  it.each([
    {
      replyType: 'ConsumerVerified',
      message: buildReplyMessage(ConsumerVerifiedSchema, { orderId }),
    },
    {
      replyType: 'TicketCreated',
      message: buildReplyMessage(TicketCreatedSchema, { orderId, ticketId: 'ticket-1' }),
    },
    {
      replyType: 'PaymentAuthorized',
      message: buildReplyMessage(PaymentAuthorizedSchema, { orderId, paymentId: 'payment-1' }),
    },
    {
      replyType: 'TicketApproved',
      message: buildReplyMessage(TicketApprovedSchema, { orderId, ticketId: 'ticket-1' }),
    },
  ])('reads $replyType', ({ replyType, message }) => {
    expect(toPlaceOrderSagaReply(message)).toEqual({ type: replyType });
  });

  it('treats a message type the saga does not know as a permanent failure', () => {
    const message = buildReplyMessage(
      ConsumerVerifiedSchema,
      { orderId },
      { messageType: 'fooddelivery.consumer.v1.ConsumerRejected' },
    );

    expect(() => toPlaceOrderSagaReply(message)).toThrow(PermanentMessageFailure);
  });

  it('treats a payload that does not decode as a permanent failure', () => {
    const message = {
      ...buildReplyMessage(TicketCreatedSchema, { orderId }),
      payload: new Uint8Array([0xff, 0xff, 0xff]),
    };

    expect(() => toPlaceOrderSagaReply(message)).toThrow(PermanentMessageFailure);
  });
});
