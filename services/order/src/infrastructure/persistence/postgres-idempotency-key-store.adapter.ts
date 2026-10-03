import type { Kysely } from 'kysely';
import type {
  IdempotencyKeyReservation,
  IdempotencyKeyStore,
} from '#application/ports/idempotency-key-store.port.ts';
import type { DB as OrderDatabase } from './generated/database.ts';

export class PostgresIdempotencyKeyStore implements IdempotencyKeyStore {
  readonly #database: Kysely<OrderDatabase>;

  constructor(database: Kysely<OrderDatabase>) {
    this.#database = database;
  }

  async reserve(reservation: IdempotencyKeyReservation): Promise<IdempotencyKeyReservation> {
    await this.#database
      .insertInto('idempotencyKeys')
      .values(reservation)
      .onConflict((conflict) => conflict.columns(['consumerId', 'idempotencyKey']).doNothing())
      .execute();
    return this.#database
      .selectFrom('idempotencyKeys')
      .selectAll()
      .where('consumerId', '=', reservation.consumerId)
      .where('idempotencyKey', '=', reservation.idempotencyKey)
      .executeTakeFirstOrThrow();
  }
}
