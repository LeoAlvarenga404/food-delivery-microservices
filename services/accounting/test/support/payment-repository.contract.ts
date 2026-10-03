import { beforeEach, describe, expect, it } from 'vitest';
import { parseOrderId } from '#domain/payment/order-id.value-object.ts';
import { parsePaymentId } from '#domain/payment/payment-id.value-object.ts';
import type { PaymentRepository } from '#domain/payment/payment.repository.ts';
import { buildPayment, orderId, unwrap } from './payment.builder.ts';

const amountBeyondSafeIntegerInCents = 9_007_199_254_740_993n;

export function describePaymentRepositoryContract(
  implementationName: string,
  createRepository: () => PaymentRepository,
): void {
  describe(`${implementationName} payment repository`, () => {
    let payments: PaymentRepository;

    beforeEach(() => {
      payments = createRepository();
    });

    it('finds a saved payment by its order with the exact amount in cents', async () => {
      const payment = buildPayment({ amountInCents: amountBeyondSafeIntegerInCents });

      await payments.save(payment);

      expect((await payments.findByOrderId(orderId))?.toSnapshot()).toEqual({
        ...payment.toSnapshot(),
        version: 1,
      });
    });

    it('returns undefined for an order without payment', async () => {
      const otherOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000af'));

      expect(await payments.findByOrderId(otherOrderId)).toBeUndefined();
    });

    it('refuses a second payment for the same order', async () => {
      await payments.save(buildPayment());
      const otherPaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000ea'));

      await expect(payments.save(buildPayment({ paymentId: otherPaymentId }))).rejects.toThrow();
    });

    it('refuses a second payment with the same payment id for another order', async () => {
      await payments.save(buildPayment());
      const otherOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000af'));

      await expect(payments.save(buildPayment({ orderId: otherOrderId }))).rejects.toThrow();
    });
  });
}
