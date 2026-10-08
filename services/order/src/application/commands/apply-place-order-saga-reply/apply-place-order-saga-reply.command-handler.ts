import { left, right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import {
  placeOrderSagaDeadline,
  type PlaceOrderSagaTimeoutsInMilliseconds,
} from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';
import { placeOrderSaga } from '#application/sagas/place-order/place-order.saga.ts';
import type { PlaceOrderSagaCommand } from '#application/sagas/place-order/place-order.saga-state.ts';
import type { Order } from '#domain/order/order.aggregate.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { InvalidOrderTransition } from '#domain/order/order.errors.ts';
import type {
  ApplyPlaceOrderSagaReplyCommand,
  ApplyPlaceOrderSagaReplyError,
} from './apply-place-order-saga-reply.command.ts';

type OrderChange = (order: Order, now: Date) => Either<InvalidOrderTransition, void>;

export class ApplyPlaceOrderSagaReplyCommandHandler {
  readonly #unitOfWork: UnitOfWork;
  readonly #clock: Clock;
  readonly #sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds;

  constructor(
    unitOfWork: UnitOfWork,
    clock: Clock,
    sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds,
  ) {
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
    this.#sagaTimeoutsInMilliseconds = sagaTimeoutsInMilliseconds;
  }

  async execute(
    command: ApplyPlaceOrderSagaReplyCommand,
  ): Promise<Either<ApplyPlaceOrderSagaReplyError, undefined>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#applyReply(scope, command));
  }

  async #applyReply(
    scope: TransactionScope,
    command: ApplyPlaceOrderSagaReplyCommand,
  ): Promise<Either<ApplyPlaceOrderSagaReplyError, undefined>> {
    const instance = await scope.sagas.findById(command.sagaId);
    if (instance === undefined) return left({ type: 'SagaNotFound', sagaId: command.sagaId });
    const decision = placeOrderSaga.decide(instance.state, command.reply);
    if (decision.isLeft()) return decision;
    for (const sagaCommand of decision.success) {
      const outcome = await this.#carryOut(scope, sagaCommand, instance.sagaId);
      if (outcome.isLeft()) return outcome;
    }
    const state = placeOrderSaga.evolve(instance.state, command.reply);
    const stepTimeoutsInMilliseconds = this.#sagaTimeoutsInMilliseconds;
    const deadlineAt = placeOrderSagaDeadline(
      state.step,
      this.#clock.now(),
      stepTimeoutsInMilliseconds,
    );
    await scope.sagas.save({ ...instance, state, deadlineAt });
    return right(undefined);
  }

  async #carryOut(
    scope: TransactionScope,
    sagaCommand: PlaceOrderSagaCommand,
    sagaId: string,
  ): Promise<Either<InvalidOrderTransition, undefined>> {
    const { orderId } = sagaCommand.order;
    if (sagaCommand.type === 'ApproveOrder') {
      return this.#changeOrder(scope, orderId, (order, now) => order.approve(now));
    }
    if (sagaCommand.type === 'RejectOrder') {
      const { rejectionReason } = sagaCommand;
      return this.#changeOrder(scope, orderId, (order, now) => order.reject(rejectionReason, now));
    }
    scope.commands.send(sagaCommand, sagaId);
    return right(undefined);
  }

  async #changeOrder(
    scope: TransactionScope,
    orderId: OrderId,
    change: OrderChange,
  ): Promise<Either<InvalidOrderTransition, undefined>> {
    const order = await scope.orders.findById(orderId);
    if (order === undefined) throw new Error(`place order saga refers to missing order ${orderId}`);
    const changed = change(order, this.#clock.now());
    if (changed.isLeft()) return changed;
    await scope.orders.save(order);
    return right(undefined);
  }
}
