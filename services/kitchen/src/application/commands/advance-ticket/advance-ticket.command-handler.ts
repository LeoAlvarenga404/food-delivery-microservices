import { left, right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import { verifyMember } from '#domain/membership/restaurant-membership.value-object.ts';
import {
  parsePreparationTime,
  type InvalidPreparationTime,
} from '#domain/ticket/preparation-time.value-object.ts';
import type { Ticket, TicketSnapshot } from '#domain/ticket/ticket.aggregate.ts';
import type { InvalidTicketTransition } from '#domain/ticket/ticket.errors.ts';
import type {
  AdvanceTicketCommand,
  AdvanceTicketError,
  TicketAdvance,
} from './advance-ticket.command.ts';

export interface AdvanceTicketDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly memberships: RestaurantMembershipRepository;
  readonly clock: Clock;
}

function applyAdvance(
  ticket: Ticket,
  advance: TicketAdvance,
  now: Date,
): Either<InvalidPreparationTime | InvalidTicketTransition, undefined> {
  switch (advance.type) {
    case 'Accept': {
      const preparationTime = parsePreparationTime(advance.preparationTimeInMinutes);
      if (preparationTime.isLeft()) return preparationTime;
      return ticket.accept(preparationTime.success, now);
    }
    case 'StartPreparing':
      return ticket.startPreparing(now);
    case 'MarkReady':
      return ticket.markReady(now);
  }
}

export class AdvanceTicketCommandHandler {
  readonly #dependencies: AdvanceTicketDependencies;

  constructor(dependencies: AdvanceTicketDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(
    command: AdvanceTicketCommand,
  ): Promise<Either<AdvanceTicketError, TicketSnapshot>> {
    const { restaurantId, principal } = command;
    const membership = await this.#dependencies.memberships.findByRestaurantId(restaurantId);
    const verification = verifyMember(membership, restaurantId, principal.staffMemberId);
    if (verification.isLeft()) return verification;
    return this.#dependencies.unitOfWork.execute(command.metadata, (scope) =>
      this.#advance(scope, command),
    );
  }

  async #advance(
    scope: TransactionScope,
    command: AdvanceTicketCommand,
  ): Promise<Either<AdvanceTicketError, TicketSnapshot>> {
    const { restaurantId, ticketId } = command;
    const ticket = await scope.tickets.findById(ticketId);
    if (ticket?.toSnapshot().restaurantId !== restaurantId) {
      return left({ type: 'TicketNotFound', restaurantId, ticketId });
    }
    const advanced = applyAdvance(ticket, command.advance, this.#dependencies.clock.now());
    if (advanced.isLeft()) return advanced;
    await scope.tickets.save(ticket);
    return right(ticket.toSnapshot());
  }
}
