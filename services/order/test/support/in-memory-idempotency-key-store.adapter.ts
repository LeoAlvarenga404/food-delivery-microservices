import type {
  IdempotencyKeyReservation,
  IdempotencyKeyStore,
} from '#application/ports/idempotency-key-store.port.ts';

export class InMemoryIdempotencyKeyStore implements IdempotencyKeyStore {
  readonly rows = new Map<string, IdempotencyKeyReservation>();

  reserve(reservation: IdempotencyKeyReservation): Promise<IdempotencyKeyReservation> {
    const key = `${reservation.consumerId}/${reservation.idempotencyKey}`;
    const stored = this.rows.get(key) ?? reservation;
    this.rows.set(key, stored);
    return Promise.resolve(stored);
  }
}
