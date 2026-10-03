import { right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { PaymentGateway } from '#application/ports/payment-gateway.port.ts';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { Payment } from '#domain/payment/payment.aggregate.ts';
import type {
  AuthorizePaymentCommand,
  AuthorizePaymentError,
} from './authorize-payment.command.ts';

export interface AuthorizePaymentDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly paymentGateway: PaymentGateway;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class AuthorizePaymentCommandHandler {
  readonly #dependencies: AuthorizePaymentDependencies;

  constructor(dependencies: AuthorizePaymentDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(
    command: AuthorizePaymentCommand,
  ): Promise<Either<AuthorizePaymentError, AccountingReply>> {
    return this.#dependencies.unitOfWork.execute(command.metadata, (scope) =>
      this.#authorize(scope, command),
    );
  }

  async #authorize(
    scope: TransactionScope,
    command: AuthorizePaymentCommand,
  ): Promise<Either<AuthorizePaymentError, AccountingReply>> {
    const { paymentGateway, idGenerator, clock } = this.#dependencies;
    const { orderId, consumerId, amountInCents, currency, paymentToken, sagaId } = command;
    const authorization = await paymentGateway.authorize({
      idempotencyKey: `${sagaId}:AuthorizePayment`,
      amountInCents,
      currency,
      paymentToken,
    });
    if (authorization.isLeft()) return authorization;
    const paymentId = idGenerator.generatePaymentId();
    await scope.payments.save(
      Payment.authorize({
        paymentId,
        orderId,
        consumerId,
        amountInCents,
        currency,
        gatewayAuthorizationId: authorization.success.authorizationId,
        authorizedAt: clock.now(),
      }),
    );
    const reply: AccountingReply = { type: 'PaymentAuthorized', orderId, paymentId };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }
}
