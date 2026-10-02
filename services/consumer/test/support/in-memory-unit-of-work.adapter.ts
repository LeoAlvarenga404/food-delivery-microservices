import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import type { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import { InMemoryConsumerRepository } from './in-memory-consumer.repository.ts';
import { FakeReplySender } from './reply-sender.fake.ts';

export class InMemoryUnitOfWork implements UnitOfWork, TransactionScope {
  readonly consumers: InMemoryConsumerRepository;
  readonly replies = new FakeReplySender();
  readonly executedMetadata: MessageMetadata[] = [];

  constructor(storedConsumers: readonly Consumer[] = []) {
    this.consumers = new InMemoryConsumerRepository(storedConsumers);
  }

  async execute<Failure, Success>(
    metadata: MessageMetadata,
    work: TransactionalWork<Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    this.executedMetadata.push(metadata);
    const sentReplyCount = this.replies.sentReplies.length;
    try {
      const outcome = await work(this);
      if (outcome.isLeft()) this.replies.sentReplies.splice(sentReplyCount);
      return outcome;
    } catch (error) {
      this.replies.sentReplies.splice(sentReplyCount);
      throw error;
    }
  }
}
