import { PostgresUnitOfWork, type UnitOfWorkContext } from '@fd/chassis-outbox';
import type { Kysely, Transaction } from 'kysely';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { OutboxReplySender } from '#infrastructure/messaging/outbound/outbox-reply-sender.adapter.ts';
import type { DB as ConsumerDatabase } from './generated/database.ts';
import { PostgresConsumerRepository } from './postgres-consumer.repository.ts';

export type ConsumerUnitOfWork = PostgresUnitOfWork<ConsumerDatabase, TransactionScope, never>;

export interface ConsumerUnitOfWorkSettings {
  readonly database: Kysely<ConsumerDatabase>;
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

function createTransactionScope(
  context: UnitOfWorkContext<ConsumerDatabase, never>,
): TransactionScope {
  return {
    consumers: new PostgresConsumerRepository(context.transaction),
    replies: new OutboxReplySender(context.enqueue),
  };
}

export function createConsumerUnitOfWork(settings: ConsumerUnitOfWorkSettings): ConsumerUnitOfWork {
  return new PostgresUnitOfWork({
    ...settings,
    createRepositories: createTransactionScope,
    toOutboxMessages: () => [],
  });
}

export function joinTransaction(
  unitOfWork: ConsumerUnitOfWork,
  transaction: Transaction<ConsumerDatabase>,
): UnitOfWork {
  return {
    execute: (metadata, work) => unitOfWork.executeWithin(transaction, metadata, work),
  };
}
