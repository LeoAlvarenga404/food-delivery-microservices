import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlaceOrderSagaRepository } from '#application/ports/place-order-saga-repository.port.ts';
import type { PlaceOrderSagaInstance } from '#application/sagas/place-order/place-order.saga-state.ts';
import { buildSagaInstance, buildSagaOrder } from './place-order-saga.builder.ts';

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
    const order = buildSagaOrder();
    let sagas: PlaceOrderSagaRepository;

    beforeEach(() => {
      sagas = createRepository();
    });

    it('finds a saved saga with its step, its payment token and the order it carries, amounts included', async () => {
      const amountBeyondSafeInteger = 9007199254740993n;
      const [firstLineItem] = order.lineItems;
      if (firstLineItem === undefined) throw new Error('the builder saga has no line items');
      const carryingLargeAmounts = buildSagaInstance({
        step: 'VERIFYING_CONSUMER',
        order: {
          ...order,
          lineItems: [{ ...firstLineItem, unitPriceInCents: amountBeyondSafeInteger, quantity: 1 }],
          totalInCents: amountBeyondSafeInteger,
        },
        paymentToken: 'tok_visa_4242',
      });

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

      await sagas.save({
        ...stored,
        state: { step: 'CREATING_TICKET', order, paymentToken: 'tok_visa_4242' },
      });
      const advanced = await findStoredSaga(sagas, started.sagaId);

      expect(advanced.state.step).toBe('CREATING_TICKET');
      expect(advanced.version).toBe(2);
    });

    it('saves the deadline of the next step and clears it once the saga is finished', async () => {
      await sagas.save(started);
      const stored = await findStoredSaga(sagas, started.sagaId);
      const nextDeadline = new Date('2026-10-02T12:00:50.000Z');

      await sagas.save({
        ...stored,
        state: { step: 'CREATING_TICKET', order, paymentToken: 'tok_visa_4242' },
        deadlineAt: nextDeadline,
      });
      const advanced = await findStoredSaga(sagas, started.sagaId);
      await sagas.save({
        ...advanced,
        state: { step: 'COMPENSATED', order, rejectionReason: 'CONSUMER_BLOCKED' },
        deadlineAt: undefined,
      });

      expect(advanced.deadlineAt).toEqual(nextDeadline);
      expect((await findStoredSaga(sagas, started.sagaId)).deadlineAt).toBeUndefined();
    });

    it('stores a saga past the payment step without its payment token', async () => {
      await sagas.save(started);
      const stored = await findStoredSaga(sagas, started.sagaId);

      await sagas.save({ ...stored, state: { step: 'APPROVING_TICKET', order } });

      expect((await findStoredSaga(sagas, started.sagaId)).state).toStrictEqual({
        step: 'APPROVING_TICKET',
        order,
      });
    });

    it('stores a compensating saga with the reason it will reject the order for', async () => {
      await sagas.save(started);
      const stored = await findStoredSaga(sagas, started.sagaId);

      await sagas.save({
        ...stored,
        state: { step: 'REJECTING_TICKET', order, rejectionReason: 'PAYMENT_DECLINED' },
      });

      expect((await findStoredSaga(sagas, started.sagaId)).state).toStrictEqual({
        step: 'REJECTING_TICKET',
        order,
        rejectionReason: 'PAYMENT_DECLINED',
      });
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await sagas.save(started);
      const stored = await findStoredSaga(sagas, started.sagaId);
      const advanced: PlaceOrderSagaInstance = {
        ...stored,
        state: { step: 'APPROVING_TICKET', order },
      };
      await sagas.save(advanced);

      await expect(sagas.save(advanced)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses a new saga whose id is already stored as a concurrency conflict', async () => {
      await sagas.save(started);

      await expect(sagas.save(started)).rejects.toThrow(ConcurrencyConflictError);
    });
  });
}
