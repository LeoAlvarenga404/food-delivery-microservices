import type { PaymentDeclined } from '#application/ports/payment-gateway.port.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { OrderId } from '#domain/payment/order-id.value-object.ts';
import type { Currency } from '#domain/payment/payment.aggregate.ts';

export interface AuthorizePaymentCommand {
  readonly orderId: OrderId;
  readonly consumerId: string;
  readonly amountInCents: bigint;
  readonly currency: Currency;
  readonly paymentToken: string;
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}

export type AuthorizePaymentError = PaymentDeclined;
