import type {
  IdempotencyKeyReservation,
  IdempotencyKeyStore,
  ReservationOutcome,
} from '#application/ports/idempotency-key-store.port.ts';

export class InMemoryIdempotencyKeyStore implements IdempotencyKeyStore {
  readonly rows = new Map<string, IdempotencyKeyReservation>();

  reserve(reservation: IdempotencyKeyReservation): Promise<ReservationOutcome> {
    const key = `${reservation.consumerId}/${reservation.idempotencyKey}`;
    const stored = this.rows.get(key);
    if (stored !== undefined) return Promise.resolve({ wasInserted: false, reservation: stored });
    this.rows.set(key, reservation);
    return Promise.resolve({ wasInserted: true, reservation });
  }
}
