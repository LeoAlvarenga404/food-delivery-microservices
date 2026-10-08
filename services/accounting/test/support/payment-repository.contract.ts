import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseOrderId } from '#domain/payment/order-id.value-object.ts';
import { parsePaymentId } from '#domain/payment/payment-id.value-object.ts';
import type { PaymentRepository } from '#domain/payment/payment.repository.ts';
import { Payment } from '#domain/payment/payment.aggregate.ts';
import { buildPayment, gatewayVoidId, orderId, unwrap } from './payment.builder.ts';

const amountBeyondSafeIntegerInCents = 9_007_199_254_740_993n;
const voidedAt = new Date('2026-10-02T12:01:30.000Z');

async function findStoredPayment(payments: PaymentRepository): Promise<Payment> {
  const payment = await payments.findByOrderId(orderId);
  if (payment === undefined) throw new Error(`the payment of order ${orderId} was not stored`);
  return payment;
}

export function describePaymentRepositoryContract(
  implementationName: string,
  createRepository: () => PaymentRepository,
): void {
  describe(`${implementationName} payment repository`, () => {
    let payments: PaymentRepository;

    beforeEach(() => {
      payments = createRepository();
    });

    it('finds a saved payment by its order with the restaurant and the exact amounts in cents', async () => {
      const payment = buildPayment({
        amount: { amountInCents: amountBeyondSafeIntegerInCents, currency: 'BRL' },
        deliveryFee: { amountInCents: 1200n, currency: 'BRL' },
      });

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

    it('refuses a second payment for the same order as a concurrency conflict', async () => {
      await payments.save(buildPayment());
      const otherPaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000ea'));

      await expect(payments.save(buildPayment({ paymentId: otherPaymentId }))).rejects.toThrow(
        ConcurrencyConflictError,
      );
    });

    it('saves the void of a stored payment with its time and gateway reference, at the next version', async () => {
      await payments.save(buildPayment());
      const stored = await findStoredPayment(payments);
      unwrap(stored.void({ voidedAt, gatewayVoidId }));

      await payments.save(stored);

      const { state, version } = (await findStoredPayment(payments)).toSnapshot();
      expect(state).toEqual({ status: 'VOIDED', voidedAt, gatewayVoidId });
      expect(version).toBe(2);
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await payments.save(buildPayment());
      const first = await findStoredPayment(payments);
      const second = await findStoredPayment(payments);
      unwrap(first.void({ voidedAt, gatewayVoidId }));
      unwrap(second.void({ voidedAt, gatewayVoidId }));
      await payments.save(first);

      await expect(payments.save(second)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses to save a change to a payment that was never stored', async () => {
      const neverStored = buildPayment();
      const restored = Payment.restore({ ...neverStored.toSnapshot(), version: 1 });

      await expect(payments.save(restored)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses to save a change to another payment over the stored payment of its order', async () => {
      await payments.save(buildPayment());
      const otherPaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000ea'));
      const otherPayment = buildPayment({ paymentId: otherPaymentId });
      const restored = Payment.restore({ ...otherPayment.toSnapshot(), version: 1 });

      await expect(payments.save(restored)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses a second payment with the same payment id for another order as a concurrency conflict', async () => {
      await payments.save(buildPayment());
      const otherOrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000af'));

      await expect(payments.save(buildPayment({ orderId: otherOrderId }))).rejects.toThrow(
        ConcurrencyConflictError,
      );
    });
  });
}
