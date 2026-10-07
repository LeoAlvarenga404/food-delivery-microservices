import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { PlaceOrderSagaRepository } from '#application/ports/place-order-saga-repository.port.ts';
import type { PlaceOrderSagaInstance } from '#application/sagas/place-order/place-order.saga-state.ts';
import type { DB as OrderDatabase } from './generated/database.ts';
import {
  placeOrderSagaPersistenceMapper,
  type SagaInstanceRow,
} from './place-order-saga.persistence-mapper.ts';

export interface ExpiredSaga {
  readonly sagaId: string;
  readonly orderId: string;
}

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
        .execute()
        .catch((error: unknown) => {
          throw ConcurrencyConflictError.fromUniqueViolation(
            error,
            `saga ${row.sagaId} already exists`,
          );
        });
      return;
    }
    await this.#update(row);
  }

  async lockExpiredSagas(now: Date, limit: number): Promise<readonly ExpiredSaga[]> {
    return this.#database
      .selectFrom('sagaInstances')
      .select(['sagaId', 'orderId'])
      .where('deadlineAt', '<', now)
      .orderBy('deadlineAt')
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
  }

  async postponeDeadline(sagaId: string, deadlineAt: Date): Promise<void> {
    await this.#database
      .updateTable('sagaInstances')
      .set({ deadlineAt })
      .where('sagaId', '=', sagaId)
      .execute();
  }

  async #update(row: SagaInstanceRow): Promise<void> {
    const { sagaId, step, state, status, deadlineAt, version } = row;
    const result = await this.#database
      .updateTable('sagaInstances')
      .set({ step, state, status, deadlineAt, version: version + 1 })
      .where('sagaId', '=', sagaId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(`saga ${sagaId} changed after version ${String(version)}`);
    }
  }
}
