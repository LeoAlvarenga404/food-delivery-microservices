export interface IdempotencyKeyReservation {
  readonly consumerId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly orderId: string;
  readonly createdAt: Date;
}

export interface IdempotencyKeyStore {
  reserve(reservation: IdempotencyKeyReservation): Promise<IdempotencyKeyReservation>;
}
