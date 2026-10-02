import type { OutboxMessage } from '@fd/chassis-outbox';
import type { ConsumerReply, ReplySender } from '#application/ports/reply-sender.port.ts';
import { toConsumerReplyMessage } from './consumer-reply.message-mapper.ts';

export class OutboxReplySender implements ReplySender {
  readonly #enqueue: (message: OutboxMessage) => void;

  constructor(enqueue: (message: OutboxMessage) => void) {
    this.#enqueue = enqueue;
  }

  send(reply: ConsumerReply, sagaId: string): void {
    this.#enqueue(toConsumerReplyMessage(reply, sagaId));
  }
}
