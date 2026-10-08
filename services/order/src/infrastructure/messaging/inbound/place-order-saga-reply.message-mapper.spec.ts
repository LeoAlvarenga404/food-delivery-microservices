import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import {
  AuthorizationVoidedSchema,
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
  PaymentFailureReason,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import {
  ConsumerVerificationFailedSchema,
  ConsumerVerificationFailureReason,
  ConsumerVerifiedSchema,
} from '@fd/contracts/fooddelivery/consumer/v1/replies_pb.js';
import {
  TicketApprovedSchema,
  TicketCreatedSchema,
  TicketCreationFailedSchema,
  TicketCreationFailureReason,
  TicketRejectedSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/replies_pb.js';
import { describe, expect, it } from 'vitest';
import { buildReplyMessage } from '../../../../test/support/reply-message.builder.ts';
import { toPlaceOrderSagaReply } from './place-order-saga-reply.message-mapper.ts';

const orderId = '0199a5d0-0000-7000-8000-0000000000a1';

function consumerVerificationFailedWithReasonNumber(reasonNumber: number): InboundMessage {
  const reasonFieldNumber = 3;
  const varintWireType = 0;
  const reasonFieldTag = reasonFieldNumber * 8 + varintWireType;
  const message = buildReplyMessage(ConsumerVerificationFailedSchema, { orderId });
  return {
    ...message,
    payload: new Uint8Array([...message.payload, reasonFieldTag, reasonNumber]),
  };
}

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
    {
      replyType: 'TicketRejected',
      message: buildReplyMessage(TicketRejectedSchema, { orderId }),
    },
    {
      replyType: 'AuthorizationVoided',
      message: buildReplyMessage(AuthorizationVoidedSchema, { orderId }),
    },
  ])('reads $replyType with the order id it names', ({ replyType, message }) => {
    expect(toPlaceOrderSagaReply(message)).toEqual({ orderId, reply: { type: replyType } });
  });

  it.each([
    {
      replyType: 'ConsumerVerificationFailed',
      message: buildReplyMessage(ConsumerVerificationFailedSchema, {
        orderId,
        reason: ConsumerVerificationFailureReason.CONSUMER_NOT_FOUND,
      }),
      rejectionReason: 'CONSUMER_NOT_FOUND',
    },
    {
      replyType: 'ConsumerVerificationFailed',
      message: buildReplyMessage(ConsumerVerificationFailedSchema, {
        orderId,
        reason: ConsumerVerificationFailureReason.CONSUMER_BLOCKED,
      }),
      rejectionReason: 'CONSUMER_BLOCKED',
    },
    {
      replyType: 'TicketCreationFailed',
      message: buildReplyMessage(TicketCreationFailedSchema, {
        orderId,
        reason: TicketCreationFailureReason.EMPTY_TICKET,
      }),
      rejectionReason: 'TICKET_REFUSED',
    },
    {
      replyType: 'TicketCreationFailed',
      message: buildReplyMessage(TicketCreationFailedSchema, {
        orderId,
        reason: TicketCreationFailureReason.INVALID_QUANTITY,
      }),
      rejectionReason: 'TICKET_REFUSED',
    },
    {
      replyType: 'PaymentFailed',
      message: buildReplyMessage(PaymentFailedSchema, {
        orderId,
        reason: PaymentFailureReason.PAYMENT_DECLINED,
      }),
      rejectionReason: 'PAYMENT_DECLINED',
    },
  ])(
    'reads $replyType as the rejection reason $rejectionReason',
    ({ replyType, message, rejectionReason }) => {
      expect(toPlaceOrderSagaReply(message)).toEqual({
        orderId,
        reply: { type: replyType, rejectionReason },
      });
    },
  );

  it.each([
    {
      problem: 'a message type the saga does not know',
      message: buildReplyMessage(
        ConsumerVerifiedSchema,
        { orderId },
        { messageType: 'fooddelivery.consumer.v1.ConsumerRejected' },
      ),
    },
    {
      problem: 'a payload that does not decode',
      message: {
        ...buildReplyMessage(TicketCreatedSchema, { orderId }),
        payload: new Uint8Array([0xff, 0xff, 0xff]),
      },
    },
    {
      problem: 'a failure reply without a reason',
      message: buildReplyMessage(PaymentFailedSchema, { orderId }),
    },
    {
      problem: 'a failure reply with a reason the saga does not know',
      message: consumerVerificationFailedWithReasonNumber(7),
    },
  ])('treats $problem as a permanent failure', ({ message }) => {
    expect(() => toPlaceOrderSagaReply(message)).toThrow(PermanentMessageFailure);
  });
});
