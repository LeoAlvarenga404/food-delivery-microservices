import { beforeEach, describe, expect, it } from 'vitest';
import type {
  IdempotencyKeyReservation,
  IdempotencyKeyStore,
} from '#application/ports/idempotency-key-store.port.ts';

export const firstReservation: IdempotencyKeyReservation = {
  consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
  idempotencyKey: 'checkout-7f3a',
  requestHash: 'hash-of-the-first-request',
  orderId: '0199a5d0-0000-7000-8000-0000000000a1',
  createdAt: new Date('2026-10-02T12:00:00.000Z'),
};

export const repeatedReservation: IdempotencyKeyReservation = {
  ...firstReservation,
  requestHash: 'hash-of-another-request',
  orderId: '0199a5d0-0000-7000-8000-0000000000a2',
  createdAt: new Date('2026-10-02T12:00:09.000Z'),
};

export function describeIdempotencyKeyStoreContract(
  implementationName: string,
  createStore: () => IdempotencyKeyStore,
): void {
  describe(`${implementationName} idempotency key store`, () => {
    let store: IdempotencyKeyStore;

    beforeEach(() => {
      store = createStore();
    });

    it('reserves a key nobody used before', async () => {
      expect(await store.reserve(firstReservation)).toEqual(firstReservation);
    });

    it('keeps the first reservation when the same consumer reuses the key', async () => {
      await store.reserve(firstReservation);

      expect(await store.reserve(repeatedReservation)).toEqual(firstReservation);
    });

    it('scopes keys per consumer', async () => {
      const otherConsumerReservation = {
        ...repeatedReservation,
        consumerId: '0199a5d0-0000-7000-8000-0000000000c2',
      };
      await store.reserve(firstReservation);

      expect(await store.reserve(otherConsumerReservation)).toEqual(otherConsumerReservation);
    });
  });
}
