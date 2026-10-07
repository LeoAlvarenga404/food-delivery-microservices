import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { buildOrder, deliveryFeeInCents, unwrap } from '../../../../test/support/order.builder.ts';
import {
  buildPlaceOrderCommand,
  requestMetadata,
} from '../../../../test/support/place-order-command.builder.ts';
import {
  buildSagaOrder,
  buildStartedSagaState,
  sagaTimeoutsInMilliseconds,
} from '../../../../test/support/place-order-saga.builder.ts';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { PlaceOrderCommandHandler } from './place-order.command-handler.ts';

const firstOrderId = '0199a5d0-0000-7000-8000-0000000000a1';
const firstSagaId = '0199a5d0-0000-7000-8000-0000000000b1';

let unitOfWork: InMemoryUnitOfWork;
let placeOrder: PlaceOrderCommandHandler;

beforeEach(() => {
  unitOfWork = new InMemoryUnitOfWork();
  placeOrder = new PlaceOrderCommandHandler({
    unitOfWork,
    clock: new FakeClock(),
    idGenerator: new FakeIdGenerator(),
    sagaTimeoutsInMilliseconds,
    deliveryFeeInCents,
  });
});

describe('PlaceOrderCommandHandler', () => {
  it('stores the pending order, starts the saga with the deadline of its first step and asks for the consumer to be verified', async () => {
    const outcome = await placeOrder.execute(buildPlaceOrderCommand());

    expect(outcome).toEqual(right({ orderId: firstOrderId }));
    const expectedOrder = buildOrder().toSnapshot();
    const storedOrder = await unitOfWork.orders.findById(expectedOrder.orderId);
    expect(storedOrder?.toSnapshot()).toEqual({ ...expectedOrder, version: 1 });
    expect(await unitOfWork.sagas.findById(firstSagaId)).toEqual({
      sagaId: firstSagaId,
      state: buildStartedSagaState(),
      version: 1,
      deadlineAt: new Date('2026-10-02T12:00:10.000Z'),
    });
    expect(unitOfWork.commands.sentCommands).toEqual([
      { command: { type: 'VerifyConsumer', order: buildSagaOrder() }, sagaId: firstSagaId },
    ]);
    expect(unitOfWork.executedMetadata).toEqual([requestMetadata]);
  });

  it('prices the order with the delivery fee it was configured with', async () => {
    const pricingPlaceOrder = new PlaceOrderCommandHandler({
      unitOfWork,
      clock: new FakeClock(),
      idGenerator: new FakeIdGenerator(),
      sagaTimeoutsInMilliseconds,
      deliveryFeeInCents: 1500n,
    });

    unwrap(await pricingPlaceOrder.execute(buildPlaceOrderCommand()));

    const { orderId } = buildOrder().toSnapshot();
    const stored = (await unitOfWork.orders.findById(orderId))?.toSnapshot();
    expect([stored?.deliveryFeeInCents, stored?.totalInCents]).toEqual([1500n, 11300n]);
  });

  it('answers a repeated key carrying the same request with the original order', async () => {
    await placeOrder.execute(buildPlaceOrderCommand());

    const repeated = await placeOrder.execute(buildPlaceOrderCommand());

    expect(repeated).toEqual(right({ orderId: firstOrderId }));
    expect(unitOfWork.orders.rows.size).toBe(1);
    expect(unitOfWork.commands.sentCommands).toHaveLength(1);
  });

  it('decides a replay from the reservation it found, even when the order id would repeat', async () => {
    const repeatingPlaceOrder = new PlaceOrderCommandHandler({
      unitOfWork,
      clock: new FakeClock(),
      idGenerator: {
        generateOrderId: () => unwrap(parseOrderId(firstOrderId)),
        generateSagaId: () => firstSagaId,
      },
      sagaTimeoutsInMilliseconds,
      deliveryFeeInCents,
    });
    await repeatingPlaceOrder.execute(buildPlaceOrderCommand());

    const repeated = await repeatingPlaceOrder.execute(buildPlaceOrderCommand());

    expect(repeated).toEqual(right({ orderId: firstOrderId }));
    expect(unitOfWork.commands.sentCommands).toHaveLength(1);
  });

  it('rejects a repeated key carrying a different request', async () => {
    await placeOrder.execute(buildPlaceOrderCommand());

    const reused = await placeOrder.execute(
      buildPlaceOrderCommand({ requestHash: 'hash-of-another-request' }),
    );

    expect(reused).toEqual(left({ type: 'IdempotencyKeyReused', idempotencyKey: 'checkout-7f3a' }));
    expect(unitOfWork.orders.rows.size).toBe(1);
  });

  it('rejects a restaurant without a menu replica', async () => {
    const restaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000ff'));

    const outcome = await placeOrder.execute(buildPlaceOrderCommand({ restaurantId }));

    expect(outcome).toEqual(left({ type: 'UnknownRestaurant', restaurantId }));
  });

  it('leaves no trace of a rejected order, so the client can retry with the same key', async () => {
    const rejected = await placeOrder.execute(buildPlaceOrderCommand({ requestedLineItems: [] }));

    expect(rejected).toEqual(left({ type: 'EmptyOrder' }));
    expect(unitOfWork.idempotencyKeys.rows.size).toBe(0);
    expect(unitOfWork.orders.rows.size).toBe(0);
    expect(unitOfWork.sagas.rows.size).toBe(0);
    expect(unitOfWork.commands.sentCommands).toEqual([]);

    const retried = await placeOrder.execute(
      buildPlaceOrderCommand({ requestHash: 'hash-of-the-corrected-request' }),
    );

    expect(retried).toEqual(right({ orderId: '0199a5d0-0000-7000-8000-0000000000a2' }));
  });
});
