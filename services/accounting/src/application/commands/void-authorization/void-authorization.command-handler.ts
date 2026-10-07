import { right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { PaymentGateway } from '#application/ports/payment-gateway.port.ts';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { parseGatewayVoidId } from '#domain/payment/gateway-void-id.value-object.ts';
import type { Payment } from '#domain/payment/payment.aggregate.ts';
import type { VoidAuthorizationCommand } from './void-authorization.command.ts';

export interface VoidAuthorizationDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly paymentGateway: PaymentGateway;
  readonly clock: Clock;
}

export class VoidAuthorizationCommandHandler {
  readonly #dependencies: VoidAuthorizationDependencies;

  constructor(dependencies: VoidAuthorizationDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(command: VoidAuthorizationCommand): Promise<Either<never, AccountingReply>> {
    return this.#dependencies.unitOfWork.execute(command.metadata, (scope) =>
      this.#void(scope, command),
    );
  }

  async #void(
    scope: TransactionScope,
    command: VoidAuthorizationCommand,
  ): Promise<Either<never, AccountingReply>> {
    const { orderId, sagaId } = command;
    const payment = await scope.payments.findByOrderId(orderId);
    if (payment?.toSnapshot().state.status === 'AUTHORIZED') {
      await this.#voidAtGateway(scope, payment, sagaId);
    }
    const reply: AccountingReply = { type: 'AuthorizationVoided', orderId };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }

  async #voidAtGateway(scope: TransactionScope, payment: Payment, sagaId: string): Promise<void> {
    const { paymentGateway, clock } = this.#dependencies;
    const { paymentId, gatewayAuthorizationId } = payment.toSnapshot();
    const gatewayVoid = await paymentGateway.void({
      idempotencyKey: `${sagaId}:VoidAuthorization`,
      authorizationId: gatewayAuthorizationId,
    });
    const gatewayVoidId = parseGatewayVoidId(gatewayVoid.voidId);
    if (gatewayVoidId.isLeft()) {
      throw new Error(`the payment gateway voided payment ${paymentId} without a reference`);
    }
    const voided = payment.void({ voidedAt: clock.now(), gatewayVoidId: gatewayVoidId.success });
    if (voided.isLeft()) throw new Error(`payment ${paymentId} was voided before its void`);
    await scope.payments.save(payment);
  }
}
