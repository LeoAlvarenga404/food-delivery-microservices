import type { PaymentId } from '#domain/payment/payment-id.value-object.ts';

export interface IdGenerator {
  generatePaymentId(): PaymentId;
}
