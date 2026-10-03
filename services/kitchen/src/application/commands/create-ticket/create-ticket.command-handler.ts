import { right, type Either } from '@fd/domain';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketCreationError } from '#domain/ticket/ticket.errors.ts';
import type { CreateTicketCommand } from './create-ticket.command.ts';

export class CreateTicketCommandHandler {
  readonly #unitOfWork: UnitOfWork;
  readonly #idGenerator: IdGenerator;

  constructor(unitOfWork: UnitOfWork, idGenerator: IdGenerator) {
    this.#unitOfWork = unitOfWork;
    this.#idGenerator = idGenerator;
  }

  async execute(command: CreateTicketCommand): Promise<Either<TicketCreationError, KitchenReply>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#create(scope, command));
  }

  async #create(
    scope: TransactionScope,
    command: CreateTicketCommand,
  ): Promise<Either<TicketCreationError, KitchenReply>> {
    const { orderId, restaurantId, lineItems, sagaId } = command;
    const ticketId = this.#idGenerator.generateTicketId();
    const creation = Ticket.create({ ticketId, orderId, restaurantId, lineItems });
    if (creation.isLeft()) return creation;
    await scope.tickets.save(creation.success);
    const reply: KitchenReply = { type: 'TicketCreated', orderId, ticketId };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }
}
