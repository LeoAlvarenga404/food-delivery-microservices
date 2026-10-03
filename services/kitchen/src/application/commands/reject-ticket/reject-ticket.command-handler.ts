import { right, type Either } from '@fd/domain';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import type { RejectTicketCommand, RejectTicketError } from './reject-ticket.command.ts';

export class RejectTicketCommandHandler {
  readonly #unitOfWork: UnitOfWork;

  constructor(unitOfWork: UnitOfWork) {
    this.#unitOfWork = unitOfWork;
  }

  async execute(command: RejectTicketCommand): Promise<Either<RejectTicketError, KitchenReply>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#reject(scope, command));
  }

  async #reject(
    scope: TransactionScope,
    command: RejectTicketCommand,
  ): Promise<Either<RejectTicketError, KitchenReply>> {
    const { orderId, sagaId } = command;
    const ticket = await scope.tickets.findByOrderId(orderId);
    if (ticket !== undefined) {
      const rejection = ticket.reject();
      if (rejection.isLeft()) return rejection;
      await scope.tickets.save(ticket);
    }
    const reply: KitchenReply = { type: 'TicketRejected', orderId };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }
}
