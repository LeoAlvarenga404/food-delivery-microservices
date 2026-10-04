import { left, right, type Either } from '@fd/domain';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import type {
  RegisterConsumerCommand,
  RegisterConsumerError,
  RegisteredConsumer,
} from './register-consumer.command.ts';

export class RegisterConsumerCommandHandler {
  readonly #unitOfWork: UnitOfWork;

  constructor(unitOfWork: UnitOfWork) {
    this.#unitOfWork = unitOfWork;
  }

  async execute(
    command: RegisterConsumerCommand,
  ): Promise<Either<RegisterConsumerError, RegisteredConsumer>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#register(scope, command));
  }

  async #register(
    scope: TransactionScope,
    command: RegisterConsumerCommand,
  ): Promise<Either<RegisterConsumerError, RegisteredConsumer>> {
    const { consumerId } = command.principal;
    const { name, email, addresses } = command;
    const consumer = Consumer.register({ consumerId, name, email, addresses });
    if (consumer.isLeft()) return consumer;
    if ((await scope.consumers.findById(consumerId)) !== undefined) {
      return left({ type: 'ConsumerAlreadyRegistered', consumerId });
    }
    await scope.consumers.save(consumer.success);
    return right({ consumerId });
  }
}
