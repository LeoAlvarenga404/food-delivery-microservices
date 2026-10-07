import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import type { Ticket, TicketEvent } from '#domain/ticket/ticket.aggregate.ts';
import { InMemoryTicketRepository } from './in-memory-ticket.repository.ts';
import { FakeReplySender } from './reply-sender.fake.ts';

export class InMemoryUnitOfWork implements UnitOfWork {
  readonly tickets = new InMemoryTicketRepository();
  readonly replies = new FakeReplySender();
  readonly publishedEvents: TicketEvent[] = [];
  readonly executedMetadata: MessageMetadata[] = [];

  async execute<Failure, Success>(
    metadata: MessageMetadata,
    work: TransactionalWork<Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    this.executedMetadata.push(metadata);
    const savedTickets: Ticket[] = [];
    const rollBack = this.#takeSavepoint();
    try {
      const outcome = await work(this.#scopeTracking(savedTickets));
      if (outcome.isLeft()) rollBack();
      else
        this.publishedEvents.push(...savedTickets.flatMap((saved) => saved.pullRecordedEvents()));
      return outcome;
    } catch (error) {
      rollBack();
      throw error;
    }
  }

  #scopeTracking(savedTickets: Ticket[]): TransactionScope {
    return {
      tickets: {
        findById: (ticketId) => this.tickets.findById(ticketId),
        findByOrderId: (orderId) => this.tickets.findByOrderId(orderId),
        findActiveByRestaurantId: (restaurantId) =>
          this.tickets.findActiveByRestaurantId(restaurantId),
        save: async (ticket) => {
          await this.tickets.save(ticket);
          savedTickets.push(ticket);
        },
      },
      replies: this.replies,
    };
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
