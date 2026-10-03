export interface IdempotencyKeyReservation {
  readonly consumerId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly orderId: string;
  readonly createdAt: Date;
}

export interface ReservationOutcome {
  readonly wasInserted: boolean;
  readonly reservation: IdempotencyKeyReservation;
}

export interface IdempotencyKeyStore {
  reserve(reservation: IdempotencyKeyReservation): Promise<ReservationOutcome>;
}
