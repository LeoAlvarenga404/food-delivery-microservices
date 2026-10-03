import { left, right, type Either } from '@fd/domain';
import type { ConsumerReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { VerifyConsumerCommand, VerifyConsumerError } from './verify-consumer.command.ts';

async function verifyMayOrder(
  scope: TransactionScope,
  consumerId: ConsumerId,
): Promise<Either<VerifyConsumerError, undefined>> {
  const consumer = await scope.consumers.findById(consumerId);
  if (consumer === undefined) return left({ type: 'ConsumerNotFound', consumerId });
  return consumer.verifyMayOrder();
}

export class VerifyConsumerCommandHandler {
  readonly #unitOfWork: UnitOfWork;

  constructor(unitOfWork: UnitOfWork) {
    this.#unitOfWork = unitOfWork;
  }

  async execute(command: VerifyConsumerCommand): Promise<Either<never, ConsumerReply>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#verify(scope, command));
  }

  async #verify(
    scope: TransactionScope,
    command: VerifyConsumerCommand,
  ): Promise<Either<never, ConsumerReply>> {
    const { consumerId, orderId, sagaId } = command;
    const verification = await verifyMayOrder(scope, consumerId);
    const reply: ConsumerReply = verification.isLeft()
      ? {
          type: 'ConsumerVerificationFailed',
          consumerId,
          orderId,
          reason: verification.failure.type,
        }
      : { type: 'ConsumerVerified', consumerId, orderId };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }
}
