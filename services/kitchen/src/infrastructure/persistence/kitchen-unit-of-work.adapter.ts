import { PostgresUnitOfWork, type UnitOfWorkContext } from '@fd/chassis-outbox';
import type { Kysely } from 'kysely';
import type { TransactionScope } from '#application/ports/unit-of-work.port.ts';
import type { TicketEvent } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketRepository } from '#domain/ticket/ticket.repository.ts';
import { OutboxReplySender } from '#infrastructure/messaging/outbound/outbox-reply-sender.adapter.ts';
import { toTicketEventMessages } from '#infrastructure/messaging/outbound/ticket-event.message-mapper.ts';
import type { DB as KitchenDatabase } from './generated/database.ts';
import { PostgresTicketRepository } from './postgres-ticket.repository.ts';

export type KitchenUnitOfWork = PostgresUnitOfWork<KitchenDatabase, TransactionScope, TicketEvent>;

export interface KitchenUnitOfWorkSettings {
  readonly database: Kysely<KitchenDatabase>;
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

function trackSavedTickets(
  tickets: TicketRepository,
  track: UnitOfWorkContext<KitchenDatabase, TicketEvent>['track'],
): TicketRepository {
  return {
    findById: (ticketId) => tickets.findById(ticketId),
    findByOrderId: (orderId) => tickets.findByOrderId(orderId),
    findActiveByRestaurantId: (restaurantId) => tickets.findActiveByRestaurantId(restaurantId),
    save: async (ticket) => {
      await tickets.save(ticket);
      track(ticket);
    },
  };
}

function createTransactionScope(
  context: UnitOfWorkContext<KitchenDatabase, TicketEvent>,
): TransactionScope {
  return {
    tickets: trackSavedTickets(new PostgresTicketRepository(context.transaction), context.track),
    replies: new OutboxReplySender(context.enqueue),
  };
}

export function createKitchenUnitOfWork(settings: KitchenUnitOfWorkSettings): KitchenUnitOfWork {
  return new PostgresUnitOfWork({
    ...settings,
    createRepositories: createTransactionScope,
    toOutboxMessages: toTicketEventMessages,
  });
}
