import type { KafkaJS } from '@confluentinc/kafka-javascript';
import { PermanentMessageFailure } from './permanent-message-failure.ts';

export interface MessageHeaders {
  readonly messageId: string;
  readonly messageType: string;
  readonly correlationId: string;
  readonly causationId: string | undefined;
  readonly sagaId: string | undefined;
  readonly traceparent: string | undefined;
  readonly actorId: string | undefined;
  readonly actorType: string | undefined;
}

function readHeader(rawHeaders: KafkaJS.IHeaders, name: string): string | undefined {
  const header = rawHeaders[name];
  const text = Array.isArray(header) ? header.map(String).join(',') : header?.toString();
  return text === undefined || text.length === 0 ? undefined : text;
}

function readRequiredHeader(rawHeaders: KafkaJS.IHeaders, name: string): string {
  const text = readHeader(rawHeaders, name);
  if (text === undefined) throw new PermanentMessageFailure(`missing required header ${name}`);
  return text;
}

export function parseMessageHeaders(rawHeaders: KafkaJS.IHeaders): MessageHeaders {
  return {
    messageId: readRequiredHeader(rawHeaders, 'message-id'),
    messageType: readRequiredHeader(rawHeaders, 'message-type'),
    correlationId: readRequiredHeader(rawHeaders, 'correlation-id'),
    causationId: readHeader(rawHeaders, 'causation-id'),
    sagaId: readHeader(rawHeaders, 'saga-id'),
    traceparent: readHeader(rawHeaders, 'traceparent'),
    actorId: readHeader(rawHeaders, 'actor-id'),
    actorType: readHeader(rawHeaders, 'actor-type'),
  };
}
