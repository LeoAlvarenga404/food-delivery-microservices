import { create, toBinary } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  PaymentAuthorizedSchema,
  type PaymentAuthorized,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';

export function toPaymentAuthorized(reply: AccountingReply): PaymentAuthorized {
  return create(PaymentAuthorizedSchema, { orderId: reply.orderId, paymentId: reply.paymentId });
}

export function toAccountingReplyMessage(reply: AccountingReply, sagaId: string): OutboxMessage {
  return {
    topic: 'order.place-order-saga.replies',
    aggregateType: 'PlaceOrderSaga',
    aggregateId: sagaId,
    messageType: PaymentAuthorizedSchema.typeName,
    payload: toBinary(PaymentAuthorizedSchema, toPaymentAuthorized(reply)),
    sagaId,
  };
}
