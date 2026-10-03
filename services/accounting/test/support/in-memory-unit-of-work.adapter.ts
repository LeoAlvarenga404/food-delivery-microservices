import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import { InMemoryPaymentRepository } from './in-memory-payment.repository.ts';
import { FakeReplySender } from './reply-sender.fake.ts';

export class InMemoryUnitOfWork implements UnitOfWork, TransactionScope {
  readonly payments = new InMemoryPaymentRepository();
  readonly replies = new FakeReplySender();
  readonly executedMetadata: MessageMetadata[] = [];

  async execute<Failure, Success>(
    metadata: MessageMetadata,
    work: TransactionalWork<Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    this.executedMetadata.push(metadata);
    const rollBack = this.#takeSavepoint();
    try {
      const outcome = await work(this);
      if (outcome.isLeft()) rollBack();
      return outcome;
    } catch (error) {
      rollBack();
      throw error;
    }
  }

  #takeSavepoint(): () => void {
    const paymentRows = new Map(this.payments.rows);
    const sentReplyCount = this.replies.sentReplies.length;
    return () => {
      this.payments.rows.clear();
      paymentRows.forEach((row, orderId) => this.payments.rows.set(orderId, row));
      this.replies.sentReplies.splice(sentReplyCount);
    };
  }
}
