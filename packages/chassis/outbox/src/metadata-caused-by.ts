import type { MessageHeaders } from '@fd/chassis-kafka';
import type { MessageMetadata } from './outbox-message.ts';

export function metadataCausedBy(headers: MessageHeaders): MessageMetadata {
  return {
    correlationId: headers.correlationId,
    causationId: headers.messageId,
    actorId: headers.actorId,
    actorType: headers.actorType,
  };
}
