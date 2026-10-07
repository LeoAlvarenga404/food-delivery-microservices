import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { NotRestaurantMember } from '#domain/membership/restaurant-membership.value-object.ts';
import type { InvalidPreparationTime } from '#domain/ticket/preparation-time.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { InvalidTicketTransition } from '#domain/ticket/ticket.errors.ts';
import type { TicketId } from '#domain/ticket/ticket-id.value-object.ts';

export type TicketAdvance =
  | { readonly type: 'Accept'; readonly preparationTimeInMinutes: number }
  | { readonly type: 'StartPreparing' }
  | { readonly type: 'MarkReady' };

export interface AdvanceTicketCommand {
  readonly principal: Principal;
  readonly restaurantId: RestaurantId;
  readonly ticketId: TicketId;
  readonly advance: TicketAdvance;
  readonly metadata: MessageMetadata;
}

export interface TicketNotFound {
  readonly type: 'TicketNotFound';
  readonly restaurantId: RestaurantId;
  readonly ticketId: TicketId;
}

export type AdvanceTicketError =
  NotRestaurantMember | TicketNotFound | InvalidPreparationTime | InvalidTicketTransition;
