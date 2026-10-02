import { left, right, type Either } from '@fd/domain';
import type { ConsumerReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import type { VerifyConsumerCommand, VerifyConsumerError } from './verify-consumer.command.ts';

export class VerifyConsumerCommandHandler {
  readonly #unitOfWork: UnitOfWork;

  constructor(unitOfWork: UnitOfWork) {
    this.#unitOfWork = unitOfWork;
  }

  async execute(
    command: VerifyConsumerCommand,
  ): Promise<Either<VerifyConsumerError, ConsumerReply>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#verify(scope, command));
  }

  async #verify(
    scope: TransactionScope,
    command: VerifyConsumerCommand,
  ): Promise<Either<VerifyConsumerError, ConsumerReply>> {
    const { consumerId, orderId, sagaId } = command;
    const consumer = await scope.consumers.findById(consumerId);
    if (consumer === undefined) return left({ type: 'ConsumerNotFound', consumerId });
    const verification = consumer.verifyMayOrder();
    if (verification.isLeft()) return verification;
    const reply: ConsumerReply = { type: 'ConsumerVerified', consumerId, orderId };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }
}
