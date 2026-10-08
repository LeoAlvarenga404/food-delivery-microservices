import { right, type Either } from '@fd/domain';
import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import { verifyMember } from '#domain/membership/restaurant-membership.value-object.ts';
import type { TicketSnapshot } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import type { ListTicketsError, ListTicketsQuery } from './list-tickets.query.ts';

export interface ListTicketsDependencies {
  readonly tickets: TicketRepository;
  readonly memberships: RestaurantMembershipRepository;
}

export class ListTicketsQueryHandler {
  readonly #dependencies: ListTicketsDependencies;

  constructor(dependencies: ListTicketsDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(
    query: ListTicketsQuery,
  ): Promise<Either<ListTicketsError, readonly TicketSnapshot[]>> {
    const { restaurantId, principal } = query;
    const membership = await this.#dependencies.memberships.findByRestaurantId(restaurantId);
    const verification = verifyMember(membership, restaurantId, principal.staffMemberId);
    if (verification.isLeft()) return verification;
    const tickets = await this.#dependencies.tickets.findActiveByRestaurantId(restaurantId);
    return right(tickets.map((ticket) => ticket.toSnapshot()));
  }
}
