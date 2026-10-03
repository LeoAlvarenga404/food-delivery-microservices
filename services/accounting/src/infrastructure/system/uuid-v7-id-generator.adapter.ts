import { v7 as generateUuidV7 } from 'uuid';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import { parsePaymentId, type PaymentId } from '#domain/payment/payment-id.value-object.ts';

export class UuidV7IdGenerator implements IdGenerator {
  generatePaymentId(): PaymentId {
    const paymentId = parsePaymentId(generateUuidV7());
    if (paymentId.isLeft()) {
      throw new Error(`uuid generator produced ${paymentId.failure.rawPaymentId}`);
    }
    return paymentId.success;
  }
}
