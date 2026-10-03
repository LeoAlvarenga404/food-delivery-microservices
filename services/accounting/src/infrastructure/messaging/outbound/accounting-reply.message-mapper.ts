import { create, toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
  PaymentFailureReason,
  type PaymentAuthorized,
  type PaymentFailed,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import type {
  AccountingReply,
  PaymentAuthorizedReply,
  PaymentFailedReply,
} from '#application/ports/reply-sender.port.ts';

export function toPaymentAuthorized(reply: PaymentAuthorizedReply): PaymentAuthorized {
  return create(PaymentAuthorizedSchema, { orderId: reply.orderId, paymentId: reply.paymentId });
}

export function toPaymentFailed(reply: PaymentFailedReply): PaymentFailed {
  return create(PaymentFailedSchema, {
    orderId: reply.orderId,
    reason: PaymentFailureReason.PAYMENT_DECLINED,
  });
}

function toReplyMessage<Schema extends DescMessage>(
  schema: Schema,
  payload: MessageShape<Schema>,
  sagaId: string,
): OutboxMessage {
  return {
    topic: 'order.place-order-saga.replies',
    aggregateType: 'PlaceOrderSaga',
    aggregateId: sagaId,
    messageType: schema.typeName,
    payload: toBinary(schema, payload),
    sagaId,
  };
}

export function toAccountingReplyMessage(reply: AccountingReply, sagaId: string): OutboxMessage {
  switch (reply.type) {
    case 'PaymentAuthorized':
      return toReplyMessage(PaymentAuthorizedSchema, toPaymentAuthorized(reply), sagaId);
    case 'PaymentFailed':
      return toReplyMessage(PaymentFailedSchema, toPaymentFailed(reply), sagaId);
  }
}
