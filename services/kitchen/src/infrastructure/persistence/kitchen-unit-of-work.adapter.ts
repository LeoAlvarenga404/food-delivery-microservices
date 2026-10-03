import { PostgresUnitOfWork, type UnitOfWorkContext } from '@fd/chassis-outbox';
import type { Kysely } from 'kysely';
import type { TransactionScope } from '#application/ports/unit-of-work.port.ts';
import { OutboxReplySender } from '#infrastructure/messaging/outbound/outbox-reply-sender.adapter.ts';
import type { DB as KitchenDatabase } from './generated/database.ts';
import { PostgresTicketRepository } from './postgres-ticket.repository.ts';

export type KitchenUnitOfWork = PostgresUnitOfWork<KitchenDatabase, TransactionScope, never>;

export interface KitchenUnitOfWorkSettings {
  readonly database: Kysely<KitchenDatabase>;
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

function createTransactionScope(
  context: UnitOfWorkContext<KitchenDatabase, never>,
): TransactionScope {
  return {
    tickets: new PostgresTicketRepository(context.transaction),
    replies: new OutboxReplySender(context.enqueue),
  };
}

export function createKitchenUnitOfWork(settings: KitchenUnitOfWorkSettings): KitchenUnitOfWork {
  return new PostgresUnitOfWork({
    ...settings,
    createRepositories: createTransactionScope,
    toOutboxMessages: () => [],
  });
}
