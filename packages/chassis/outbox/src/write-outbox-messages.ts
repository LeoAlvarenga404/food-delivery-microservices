import { activeTraceparent } from '@fd/chassis-observability';
import { sql, type QueryExecutorProvider, type RawBuilder } from 'kysely';
import type { MessageMetadata, OutboxMessage } from './outbox-message.ts';

export interface OutboxEnvelope {
  readonly metadata: MessageMetadata;
  readonly occurredAt: Date;
  readonly generateMessageId: () => string;
}

function outboxRow(
  message: OutboxMessage,
  envelope: OutboxEnvelope,
  traceparent: string | undefined,
): RawBuilder<unknown> {
  const { metadata } = envelope;
  return sql`(
    ${envelope.generateMessageId()}, ${message.topic}, ${message.aggregateType},
    ${message.aggregateId}, ${message.messageType}, ${message.payload},
    ${metadata.correlationId}, ${metadata.causationId ?? null}, ${message.sagaId ?? null},
    ${traceparent ?? null}, ${metadata.actorId ?? null}, ${metadata.actorType ?? null},
    ${envelope.occurredAt}
  )`;
}

export async function writeOutboxMessages(
  executor: QueryExecutorProvider,
  messages: readonly OutboxMessage[],
  envelope: OutboxEnvelope,
): Promise<void> {
  if (messages.length === 0) return;
  const traceparent = activeTraceparent();
  const rows = messages.map((message) => outboxRow(message, envelope, traceparent));
  await sql`
    insert into outbox (
      id, topic, aggregate_type, aggregate_id, message_type, payload, correlation_id,
      causation_id, saga_id, traceparent, actor_id, actor_type, occurred_at
    )
    values ${sql.join(rows)}
  `.execute(executor);
}
