import { left, right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdempotencyKeyReservation } from '#application/ports/idempotency-key-store.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { placeOrderSaga } from '#application/sagas/place-order/place-order.saga.ts';
import type { PlaceOrderSagaOrder } from '#application/sagas/place-order/place-order.saga-state.ts';
import { Order, type OrderSnapshot } from '#domain/order/order.aggregate.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { PlaceOrderCommand, PlaceOrderError, PlacedOrder } from './place-order.command.ts';

interface Placement {
  readonly orderId: OrderId;
  readonly placedAt: Date;
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

function toSagaOrder(snapshot: OrderSnapshot, paymentToken: string): PlaceOrderSagaOrder {
  const { orderId, consumerId, restaurantId, lineItems, totalInCents, currency } = snapshot;
  return { orderId, consumerId, restaurantId, lineItems, totalInCents, currency, paymentToken };
}

export class PlaceOrderCommandHandler {
  readonly #unitOfWork: UnitOfWork;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  constructor(unitOfWork: UnitOfWork, clock: Clock, idGenerator: IdGenerator) {
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async execute(command: PlaceOrderCommand): Promise<Either<PlaceOrderError, PlacedOrder>> {
    const placement = { orderId: this.#idGenerator.generateOrderId(), placedAt: this.#clock.now() };
    return this.#unitOfWork.execute(command.metadata, async (scope) => {
      const reservation = await scope.idempotencyKeys.reserve({
        consumerId: command.consumerId,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        orderId: placement.orderId,
        createdAt: placement.placedAt,
      });
      if (reservation.orderId !== placement.orderId) return replayPlacement(reservation, command);
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
      consumerId: command.consumerId,
      menu,
      requestedLineItems: command.requestedLineItems,
      deliveryAddress: command.deliveryAddress,
    });
    if (order.isLeft()) return order;
    await scope.orders.save(order.success);
    await this.#startSaga(scope, toSagaOrder(order.success.toSnapshot(), command.paymentToken));
    return right({ orderId: placement.orderId });
  }

  async #startSaga(scope: TransactionScope, sagaOrder: PlaceOrderSagaOrder): Promise<void> {
    const sagaId = this.#idGenerator.generateSagaId();
    const { state, commands } = placeOrderSaga.start(sagaOrder);
    await scope.sagas.save({ sagaId, state, version: 0 });
    commands.forEach((sagaCommand) => {
      scope.commands.send(sagaCommand, sagaId);
    });
  }
}
