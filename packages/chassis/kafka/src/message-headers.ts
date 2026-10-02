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

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function assertUuid(text: string, name: string): void {
  if (!canonicalUuid.test(text)) {
    throw new PermanentMessageFailure(`header ${name} is not a uuid`);
  }
}

function readIdentifierHeader(rawHeaders: KafkaJS.IHeaders, name: string): string | undefined {
  const text = readHeader(rawHeaders, name);
  if (text !== undefined) assertUuid(text, name);
  return text;
}

function readRequiredIdentifierHeader(rawHeaders: KafkaJS.IHeaders, name: string): string {
  const text = readRequiredHeader(rawHeaders, name);
  assertUuid(text, name);
  return text;
}

export function parseMessageHeaders(rawHeaders: KafkaJS.IHeaders): MessageHeaders {
  return {
    messageId: readRequiredIdentifierHeader(rawHeaders, 'message-id'),
    messageType: readRequiredHeader(rawHeaders, 'message-type'),
    correlationId: readRequiredIdentifierHeader(rawHeaders, 'correlation-id'),
    causationId: readIdentifierHeader(rawHeaders, 'causation-id'),
    sagaId: readIdentifierHeader(rawHeaders, 'saga-id'),
    traceparent: readHeader(rawHeaders, 'traceparent'),
    actorId: readHeader(rawHeaders, 'actor-id'),
    actorType: readHeader(rawHeaders, 'actor-type'),
  };
}
