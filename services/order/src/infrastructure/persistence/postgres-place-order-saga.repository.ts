import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { PlaceOrderSagaRepository } from '#application/ports/place-order-saga-repository.port.ts';
import type { PlaceOrderSagaInstance } from '#application/sagas/place-order/place-order.saga-state.ts';
import type { DB as OrderDatabase } from './generated/database.ts';
import {
  placeOrderSagaPersistenceMapper,
  type SagaInstanceRow,
} from './place-order-saga.persistence-mapper.ts';

export class PostgresPlaceOrderSagaRepository implements PlaceOrderSagaRepository {
  readonly #database: Kysely<OrderDatabase>;

  constructor(database: Kysely<OrderDatabase>) {
    this.#database = database;
  }

  async findById(sagaId: string): Promise<PlaceOrderSagaInstance | undefined> {
    const row = await this.#database
      .selectFrom('sagaInstances')
      .selectAll()
      .where('sagaId', '=', sagaId)
      .executeTakeFirst();
    return row === undefined ? undefined : placeOrderSagaPersistenceMapper.toDomain(row);
  }

  async save(instance: PlaceOrderSagaInstance): Promise<void> {
    const row = placeOrderSagaPersistenceMapper.toPersistence(instance);
    if (instance.version === 0) {
      await this.#database
        .insertInto('sagaInstances')
        .values({ ...row, version: 1 })
        .execute();
      return;
    }
    await this.#update(row);
  }

  async #update(row: SagaInstanceRow): Promise<void> {
    const { sagaId, step, state, status, version } = row;
    const result = await this.#database
      .updateTable('sagaInstances')
      .set({ step, state, status, version: version + 1 })
      .where('sagaId', '=', sagaId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(`saga ${sagaId} changed after version ${String(version)}`);
    }
  }
}
