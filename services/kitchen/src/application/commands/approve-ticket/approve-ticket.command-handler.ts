import { left, right, type Either } from '@fd/domain';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import type { ApproveTicketCommand, ApproveTicketError } from './approve-ticket.command.ts';

export class ApproveTicketCommandHandler {
  readonly #unitOfWork: UnitOfWork;

  constructor(unitOfWork: UnitOfWork) {
    this.#unitOfWork = unitOfWork;
  }

  async execute(command: ApproveTicketCommand): Promise<Either<ApproveTicketError, KitchenReply>> {
    return this.#unitOfWork.execute(command.metadata, (scope) => this.#approve(scope, command));
  }

  async #approve(
    scope: TransactionScope,
    command: ApproveTicketCommand,
  ): Promise<Either<ApproveTicketError, KitchenReply>> {
    const { orderId, sagaId } = command;
    const ticket = await scope.tickets.findByOrderId(orderId);
    if (ticket === undefined) return left({ type: 'TicketNotFound', orderId });
    const approval = ticket.approve();
    if (approval.isLeft()) return approval;
    await scope.tickets.save(ticket);
    const reply: KitchenReply = {
      type: 'TicketApproved',
      orderId,
      ticketId: ticket.toSnapshot().ticketId,
    };
    scope.replies.send(reply, sagaId);
    return right(reply);
  }
}
