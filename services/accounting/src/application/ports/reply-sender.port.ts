import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { PaymentId } from '#domain/payment/payment-id.value-object.ts';

export interface PaymentAuthorizedReply {
  readonly type: 'PaymentAuthorized';
  readonly orderId: OrderId;
  readonly paymentId: PaymentId;
}

export interface PaymentFailedReply {
  readonly type: 'PaymentFailed';
  readonly orderId: OrderId;
}

export type AccountingReply = PaymentAuthorizedReply | PaymentFailedReply;

export interface ReplySender {
  send(reply: AccountingReply, sagaId: string): void;
}
