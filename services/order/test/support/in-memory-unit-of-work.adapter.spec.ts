import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import type { TransactionScope } from '#application/ports/unit-of-work.port.ts';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import { firstReservation } from './idempotency-key-store.contract.ts';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.adapter.ts';
import { buildOrder, pizzeriaMenu, unwrap } from './order.builder.ts';
import { requestMetadata } from './place-order-command.builder.ts';
import { buildSagaInstance, buildSagaOrder } from './place-order-saga.builder.ts';

async function writeEverything(scope: TransactionScope): Promise<void> {
  const saga = buildSagaInstance();
  await scope.orders.save(buildOrder());
  await scope.menus.saveIfNewer({
    ...pizzeriaMenu,
    restaurantId: unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-000000000002')),
  });
  await scope.sagas.save(saga);
  await scope.idempotencyKeys.reserve(firstReservation);
  scope.commands.send({ type: 'VerifyConsumer', order: buildSagaOrder() }, saga.sagaId);
}

function countWrittenState(unitOfWork: InMemoryUnitOfWork): readonly number[] {
  return [
    unitOfWork.orders.rows.size,
    unitOfWork.menus.rows.size,
    unitOfWork.sagas.rows.size,
    unitOfWork.idempotencyKeys.rows.size,
    unitOfWork.commands.sentCommands.length,
  ];
}

describe('InMemoryUnitOfWork', () => {
  it('keeps everything the work wrote when it returns a Right', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    await unitOfWork.execute(requestMetadata, async (scope) => {
      await writeEverything(scope);
      return right(undefined);
    });

    expect(countWrittenState(unitOfWork)).toEqual([1, 2, 1, 1, 1]);
  });

  it('forgets an order, a menu replica, a saga, a key reservation and a command when the work returns a Left', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await unitOfWork.execute(requestMetadata, async (scope) => {
      await writeEverything(scope);
      return left({ type: 'EmptyOrder' });
    });

    expect(outcome).toEqual(left({ type: 'EmptyOrder' }));
    expect(countWrittenState(unitOfWork)).toEqual([0, 1, 0, 0, 0]);
  });

  it('forgets an order, a menu replica, a saga, a key reservation and a command when the work throws', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = unitOfWork.execute(requestMetadata, async (scope) => {
      await writeEverything(scope);
      throw new Error('the work failed');
    });

    await expect(outcome).rejects.toThrow('the work failed');
    expect(countWrittenState(unitOfWork)).toEqual([0, 1, 0, 0, 0]);
  });
});
