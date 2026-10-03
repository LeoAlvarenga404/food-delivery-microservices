import type { PlaceOrderSagaInstance } from '#application/sagas/place-order/place-order.saga-state.ts';

export interface PlaceOrderSagaRepository {
  findById(sagaId: string): Promise<PlaceOrderSagaInstance | undefined>;
  save(instance: PlaceOrderSagaInstance): Promise<void>;
}
