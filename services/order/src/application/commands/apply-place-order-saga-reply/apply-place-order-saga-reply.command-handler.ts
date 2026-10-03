import { left, right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import {
  placeOrderSaga,
  type PlaceOrderSagaCommand,
} from '#application/sagas/place-order/place-order.saga.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { InvalidOrderTransition } from '#domain/order/order.errors.ts';
import type {
  ApplyPlaceOrderSagaReplyCommand,
  ApplyPlaceOrderSagaReplyError,
} from './apply-place-order-saga-reply.command.ts';

export class ApplyPlaceOrderSagaReplyCommandHandler {
  readonly #unitOfWork: UnitOfWork;
  readonly #clock: Clock;

  constructor(unitOfWork: UnitOfWork, clock: Clock) {
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
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
    await scope.sagas.save({ ...instance, state });
    return right(undefined);
  }

  async #carryOut(
    scope: TransactionScope,
    sagaCommand: PlaceOrderSagaCommand,
    sagaId: string,
  ): Promise<Either<InvalidOrderTransition, undefined>> {
    if (sagaCommand.type === 'ApproveOrder') {
      return this.#approveOrder(scope, sagaCommand.order.orderId);
    }
    scope.commands.send(sagaCommand, sagaId);
    return right(undefined);
  }

  async #approveOrder(
    scope: TransactionScope,
    orderId: OrderId,
  ): Promise<Either<InvalidOrderTransition, undefined>> {
    const order = await scope.orders.findById(orderId);
    if (order === undefined) throw new Error(`place order saga refers to missing order ${orderId}`);
    const approval = order.approve(this.#clock.now());
    if (approval.isLeft()) return approval;
    await scope.orders.save(order);
    return right(undefined);
  }
}
