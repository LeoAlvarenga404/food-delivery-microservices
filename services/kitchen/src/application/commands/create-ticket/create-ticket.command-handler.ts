import { right, type Either } from '@fd/domain';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { Ticket } from '#domain/ticket/ticket.aggregate.ts';
import type { CreateTicketCommand } from './create-ticket.command.ts';

function answerSaga(
  scope: TransactionScope,
  reply: KitchenReply,
  sagaId: string,
): Either<never, KitchenReply> {
  scope.replies.send(reply, sagaId);
  return right(reply);
}

export class CreateTicketCommandHandler {
  readonly #unitOfWork: UnitOfWork;
  readonly #idGenerator: IdGenerator;

  constructor(unitOfWork: UnitOfWork, idGenerator: IdGenerator) {
    this.#unitOfWork = unitOfWork;
    this.#idGenerator = idGenerator;
  }

  async execute(command: CreateTicketCommand): Promise<Either<never, KitchenReply>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#create(scope, command));
  }

  async #create(
    scope: TransactionScope,
    command: CreateTicketCommand,
  ): Promise<Either<never, KitchenReply>> {
    const { orderId, restaurantId, lineItems, sagaId } = command;
    const existing = await scope.tickets.findByOrderId(orderId);
    if (existing !== undefined) {
      const { ticketId } = existing.toSnapshot();
      return answerSaga(scope, { type: 'TicketCreated', orderId, ticketId }, sagaId);
    }
    const ticketId = this.#idGenerator.generateTicketId();
    const creation = Ticket.create({ ticketId, orderId, restaurantId, lineItems });
    if (creation.isLeft()) {
      const reason = creation.failure.type;
      return answerSaga(scope, { type: 'TicketCreationFailed', orderId, reason }, sagaId);
    }
    await scope.tickets.save(creation.success);
    return answerSaga(scope, { type: 'TicketCreated', orderId, ticketId }, sagaId);
  }
}
