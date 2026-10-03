import type { Kysely } from 'kysely';
import type {
  IdempotencyKeyReservation,
  IdempotencyKeyStore,
  ReservationOutcome,
} from '#application/ports/idempotency-key-store.port.ts';
import type { DB as OrderDatabase } from './generated/database.ts';

const idempotencyKeyRetentionInMilliseconds = 86_400_000;

export class PostgresIdempotencyKeyStore implements IdempotencyKeyStore {
  readonly #database: Kysely<OrderDatabase>;

  constructor(database: Kysely<OrderDatabase>) {
    this.#database = database;
  }

  async reserve(reservation: IdempotencyKeyReservation): Promise<ReservationOutcome> {
    const inserted = await this.#database
      .insertInto('idempotencyKeys')
      .values(reservation)
      .onConflict((conflict) => conflict.columns(['consumerId', 'idempotencyKey']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (inserted !== undefined) return { wasInserted: true, reservation: inserted };
    const stored = await this.#database
      .selectFrom('idempotencyKeys')
      .selectAll()
      .where('consumerId', '=', reservation.consumerId)
      .where('idempotencyKey', '=', reservation.idempotencyKey)
      .executeTakeFirstOrThrow();
    return { wasInserted: false, reservation: stored };
  }

  async deleteExpired(now: Date): Promise<number> {
    const oldestKept = new Date(now.getTime() - idempotencyKeyRetentionInMilliseconds);
    const result = await this.#database
      .deleteFrom('idempotencyKeys')
      .where('createdAt', '<', oldestKept)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
