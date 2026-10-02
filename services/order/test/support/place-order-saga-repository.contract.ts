import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlaceOrderSagaRepository } from '#application/ports/place-order-saga-repository.port.ts';
import type { PlaceOrderSagaInstance } from '#application/sagas/place-order/place-order.saga-state.ts';
import { buildSagaInstance } from './place-order-saga.builder.ts';

async function findStoredSaga(
  sagas: PlaceOrderSagaRepository,
  sagaId: string,
): Promise<PlaceOrderSagaInstance> {
  const instance = await sagas.findById(sagaId);
  if (instance === undefined) throw new Error(`saga ${sagaId} was not stored`);
  return instance;
}

export function describePlaceOrderSagaRepositoryContract(
  implementationName: string,
  createRepository: () => PlaceOrderSagaRepository,
): void {
  describe(`${implementationName} place order saga repository`, () => {
    const started = buildSagaInstance();
    let sagas: PlaceOrderSagaRepository;

    beforeEach(() => {
      sagas = createRepository();
    });

    it('finds a saved saga with its step and the order it carries, amounts included', async () => {
      const amountBeyondSafeInteger = 9007199254740993n;
      const [firstLineItem] = started.state.order.lineItems;
      if (firstLineItem === undefined) throw new Error('the builder saga has no line items');
      const carryingLargeAmounts = {
        ...started,
        state: {
          ...started.state,
          order: {
            ...started.state.order,
            lineItems: [
              { ...firstLineItem, unitPriceInCents: amountBeyondSafeInteger, quantity: 1 },
            ],
            totalInCents: amountBeyondSafeInteger,
          },
        },
      };

      await sagas.save(carryingLargeAmounts);

      expect(await findStoredSaga(sagas, started.sagaId)).toEqual({
        ...carryingLargeAmounts,
        version: 1,
      });
    });

    it('returns undefined for a saga that was never saved', async () => {
      expect(await sagas.findById('0199a5d0-0000-7000-8000-0000000000ff')).toBeUndefined();
    });

    it('saves the next step of a stored saga and increments its version', async () => {
      await sagas.save(started);
      const stored = await findStoredSaga(sagas, started.sagaId);

      await sagas.save({ ...stored, state: { ...stored.state, step: 'CREATING_TICKET' } });
      const advanced = await findStoredSaga(sagas, started.sagaId);

      expect(advanced.state.step).toBe('CREATING_TICKET');
      expect(advanced.version).toBe(2);
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await sagas.save(started);
      const stored = await findStoredSaga(sagas, started.sagaId);
      await sagas.save({ ...stored, state: { ...stored.state, step: 'CREATING_TICKET' } });

      await expect(
        sagas.save({ ...stored, state: { ...stored.state, step: 'CREATING_TICKET' } }),
      ).rejects.toThrow(ConcurrencyConflictError);
    });
  });
}
