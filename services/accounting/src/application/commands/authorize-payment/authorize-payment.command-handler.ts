import { right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type {
  GatewayAuthorization,
  PaymentGateway,
} from '#application/ports/payment-gateway.port.ts';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { parseGatewayAuthorizationId } from '#domain/payment/gateway-authorization-id.value-object.ts';
import type { PaymentId } from '#domain/payment/payment-id.value-object.ts';
import { Payment } from '#domain/payment/payment.aggregate.ts';
import type { AuthorizePaymentCommand } from './authorize-payment.command.ts';

export interface AuthorizePaymentDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly paymentGateway: PaymentGateway;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

function answerSaga(
  scope: TransactionScope,
  reply: AccountingReply,
  sagaId: string,
): Either<never, AccountingReply> {
  scope.replies.send(reply, sagaId);
  return right(reply);
}

export class AuthorizePaymentCommandHandler {
  readonly #dependencies: AuthorizePaymentDependencies;

  constructor(dependencies: AuthorizePaymentDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(command: AuthorizePaymentCommand): Promise<Either<never, AccountingReply>> {
    return this.#dependencies.unitOfWork.execute(command.metadata, (scope) =>
      this.#authorize(scope, command),
    );
  }

  async #authorize(
    scope: TransactionScope,
    command: AuthorizePaymentCommand,
  ): Promise<Either<never, AccountingReply>> {
    const { orderId, amount, paymentToken, sagaId } = command;
    const recorded = await scope.payments.findByOrderId(orderId);
    if (recorded !== undefined) {
      const { paymentId } = recorded.toSnapshot();
      return answerSaga(scope, { type: 'PaymentAuthorized', orderId, paymentId }, sagaId);
    }
    const authorization = await this.#dependencies.paymentGateway.authorize({
      idempotencyKey: `${sagaId}:AuthorizePayment`,
      amount,
      paymentToken,
    });
    if (authorization.isLeft()) {
      return answerSaga(scope, { type: 'PaymentFailed', orderId }, sagaId);
    }
    const paymentId = await this.#recordPayment(scope, command, authorization.success);
    return answerSaga(scope, { type: 'PaymentAuthorized', orderId, paymentId }, sagaId);
  }

  async #recordPayment(
    scope: TransactionScope,
    command: AuthorizePaymentCommand,
    authorization: GatewayAuthorization,
  ): Promise<PaymentId> {
    const { idGenerator, clock } = this.#dependencies;
    const { orderId, consumerId, restaurantId, amount, deliveryFee } = command;
    const gatewayAuthorizationId = parseGatewayAuthorizationId(authorization.authorizationId);
    if (gatewayAuthorizationId.isLeft()) {
      throw new Error(`the payment gateway authorized order ${orderId} without a reference`);
    }
    const paymentId = idGenerator.generatePaymentId();
    await scope.payments.save(
      Payment.authorize({
        paymentId,
        orderId,
        consumerId,
        restaurantId,
        amount,
        deliveryFee,
        gatewayAuthorizationId: gatewayAuthorizationId.success,
        authorizedAt: clock.now(),
      }),
    );
    return paymentId;
  }
}
