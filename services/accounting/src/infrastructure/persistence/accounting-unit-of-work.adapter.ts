import { PostgresUnitOfWork, type UnitOfWorkContext } from '@fd/chassis-outbox';
import type { Kysely, Transaction } from 'kysely';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { OutboxReplySender } from '#infrastructure/messaging/outbound/outbox-reply-sender.adapter.ts';
import type { DB as AccountingDatabase } from './generated/database.ts';
import { PostgresPaymentRepository } from './postgres-payment.repository.ts';

export type AccountingUnitOfWork = PostgresUnitOfWork<AccountingDatabase, TransactionScope, never>;

export interface AccountingUnitOfWorkSettings {
  readonly database: Kysely<AccountingDatabase>;
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

function createTransactionScope(
  context: UnitOfWorkContext<AccountingDatabase, never>,
): TransactionScope {
  return {
    payments: new PostgresPaymentRepository(context.transaction),
    replies: new OutboxReplySender(context.enqueue),
  };
}

export function createAccountingUnitOfWork(
  settings: AccountingUnitOfWorkSettings,
): AccountingUnitOfWork {
  return new PostgresUnitOfWork({
    ...settings,
    createRepositories: createTransactionScope,
    toOutboxMessages: () => [],
  });
}

export function joinTransaction(
  unitOfWork: AccountingUnitOfWork,
  transaction: Transaction<AccountingDatabase>,
): UnitOfWork {
  return {
    execute: (metadata, work) => unitOfWork.executeWithin(transaction, metadata, work),
  };
}
