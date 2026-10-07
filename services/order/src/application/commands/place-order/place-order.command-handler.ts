import { left, right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdempotencyKeyReservation } from '#application/ports/idempotency-key-store.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import {
  placeOrderSagaDeadline,
  type PlaceOrderSagaTimeoutsInMilliseconds,
} from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';
import { placeOrderSaga } from '#application/sagas/place-order/place-order.saga.ts';
import type { PlaceOrderSagaOrder } from '#application/sagas/place-order/place-order.saga-state.ts';
import { Order, type OrderSnapshot } from '#domain/order/order.aggregate.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { PlaceOrderCommand, PlaceOrderError, PlacedOrder } from './place-order.command.ts';

export interface PlaceOrderDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds;
  readonly deliveryFeeInCents: bigint;
}

interface Placement {
  readonly orderId: OrderId;
  readonly placedAt: Date;
}

interface SagaStartInput {
  readonly sagaOrder: PlaceOrderSagaOrder;
  readonly paymentToken: string;
  readonly placement: Placement;
}

function replayPlacement(
  reservation: IdempotencyKeyReservation,
  command: PlaceOrderCommand,
): Either<PlaceOrderError, PlacedOrder> {
  if (reservation.requestHash !== command.requestHash) {
    return left({ type: 'IdempotencyKeyReused', idempotencyKey: command.idempotencyKey });
  }
  return right({ orderId: reservation.orderId });
}

function toSagaOrder(snapshot: OrderSnapshot): PlaceOrderSagaOrder {
  const { orderId, consumerId, restaurantId, lineItems, totalInCents, currency } = snapshot;
  return { orderId, consumerId, restaurantId, lineItems, totalInCents, currency };
}

export class PlaceOrderCommandHandler {
  readonly #dependencies: PlaceOrderDependencies;

  constructor(dependencies: PlaceOrderDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(command: PlaceOrderCommand): Promise<Either<PlaceOrderError, PlacedOrder>> {
    const { unitOfWork, clock, idGenerator } = this.#dependencies;
    const placement = { orderId: idGenerator.generateOrderId(), placedAt: clock.now() };
    return unitOfWork.execute(command.metadata, async (scope) => {
      const reserved = await scope.idempotencyKeys.reserve({
        consumerId: command.principal.consumerId,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        orderId: placement.orderId,
        createdAt: placement.placedAt,
      });
      if (!reserved.wasInserted) return replayPlacement(reserved.reservation, command);
      return this.#placeOrder(scope, command, placement);
    });
  }

  async #placeOrder(
    scope: TransactionScope,
    command: PlaceOrderCommand,
    placement: Placement,
  ): Promise<Either<PlaceOrderError, PlacedOrder>> {
    const { restaurantId } = command;
    const menu = await scope.menus.findByRestaurantId(restaurantId);
    if (menu === undefined) return left({ type: 'UnknownRestaurant', restaurantId });
    const order = Order.place({
      ...placement,
      consumerId: command.principal.consumerId,
      menu,
      requestedLineItems: command.requestedLineItems,
      deliveryAddress: command.deliveryAddress,
      deliveryFeeInCents: this.#dependencies.deliveryFeeInCents,
    });
    if (order.isLeft()) return order;
    await scope.orders.save(order.success);
    const sagaOrder = toSagaOrder(order.success.toSnapshot());
    await this.#startSaga(scope, { sagaOrder, paymentToken: command.paymentToken, placement });
    return right({ orderId: placement.orderId });
  }

  async #startSaga(scope: TransactionScope, start: SagaStartInput): Promise<void> {
    const { idGenerator, sagaTimeoutsInMilliseconds } = this.#dependencies;
    const sagaId = idGenerator.generateSagaId();
    const { state, commands } = placeOrderSaga.start(start.sagaOrder, start.paymentToken);
    const { placedAt } = start.placement;
    const deadlineAt = placeOrderSagaDeadline(state.step, placedAt, sagaTimeoutsInMilliseconds);
    await scope.sagas.save({ sagaId, state, version: 0, deadlineAt });
    commands.forEach((sagaCommand) => {
      scope.commands.send(sagaCommand, sagaId);
    });
  }
}
