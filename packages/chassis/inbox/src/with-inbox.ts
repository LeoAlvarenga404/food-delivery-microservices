import type { InboundMessage, MessageHandler } from '@fd/chassis-kafka';
import { runInTransaction } from '@fd/chassis-postgres';
import { sql, type Kysely, type QueryExecutorProvider, type Transaction } from 'kysely';

export interface InboxSettings<Schema> {
  readonly database: Kysely<Schema>;
  readonly handlerName: string;
  readonly now: () => Date;
}

export type TransactionalMessageHandler<Schema> = (
  message: InboundMessage,
  transaction: Transaction<Schema>,
) => Promise<void>;

interface InboxEntry {
  readonly messageId: string;
  readonly handlerName: string;
  readonly processedAt: Date;
}

async function recordInboxEntry(
  executor: QueryExecutorProvider,
  entry: InboxEntry,
): Promise<boolean> {
  const inserted = await sql<{ readonly messageId: string }>`
    insert into inbox (message_id, handler_name, processed_at)
    values (${entry.messageId}, ${entry.handlerName}, ${entry.processedAt})
    on conflict (message_id, handler_name) do nothing
    returning message_id
  `.execute(executor);
  return inserted.rows.length > 0;
}

export function withInbox<Schema>(
  settings: InboxSettings<Schema>,
  handle: TransactionalMessageHandler<Schema>,
): MessageHandler {
  return (message) =>
    runInTransaction(settings.database, async (transaction) => {
      const isFirstDelivery = await recordInboxEntry(transaction, {
        messageId: message.headers.messageId,
        handlerName: settings.handlerName,
        processedAt: settings.now(),
      });
      if (isFirstDelivery) await handle(message, transaction);
    });
}
