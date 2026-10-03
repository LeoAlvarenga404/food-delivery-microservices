import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { PlaceOrderSagaRepository } from '#application/ports/place-order-saga-repository.port.ts';
import type { PlaceOrderSagaInstance } from '#application/sagas/place-order/place-order.saga-state.ts';
import {
  placeOrderSagaPersistenceMapper,
  type SagaInstanceRow,
} from '#infrastructure/persistence/place-order-saga.persistence-mapper.ts';

export class InMemoryPlaceOrderSagaRepository implements PlaceOrderSagaRepository {
  readonly rows = new Map<string, SagaInstanceRow>();

  findById(sagaId: string): Promise<PlaceOrderSagaInstance | undefined> {
    const row = this.rows.get(sagaId);
    return Promise.resolve(
      row === undefined ? undefined : placeOrderSagaPersistenceMapper.toDomain(row),
    );
  }

  save(instance: PlaceOrderSagaInstance): Promise<void> {
    const storedVersion = this.rows.get(instance.sagaId)?.version ?? 0;
    if (storedVersion !== instance.version) {
      return Promise.reject(new ConcurrencyConflictError(`saga ${instance.sagaId} changed`));
    }
    const row = placeOrderSagaPersistenceMapper.toPersistence(instance);
    this.rows.set(instance.sagaId, { ...row, version: instance.version + 1 });
    return Promise.resolve();
  }
}
