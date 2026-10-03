import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import { InMemoryTicketRepository } from './in-memory-ticket.repository.ts';
import { FakeReplySender } from './reply-sender.fake.ts';

export class InMemoryUnitOfWork implements UnitOfWork, TransactionScope {
  readonly tickets = new InMemoryTicketRepository();
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
    const ticketRows = new Map(this.tickets.rows);
    const sentReplyCount = this.replies.sentReplies.length;
    return () => {
      this.tickets.rows.clear();
      ticketRows.forEach((row, ticketId) => this.tickets.rows.set(ticketId, row));
      this.replies.sentReplies.splice(sentReplyCount);
    };
  }
}
