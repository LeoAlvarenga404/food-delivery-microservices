import type { OutboxMessage } from '@fd/chassis-outbox';
import type { KitchenReply, ReplySender } from '#application/ports/reply-sender.port.ts';
import { toKitchenReplyMessage } from './kitchen-reply.message-mapper.ts';

export class OutboxReplySender implements ReplySender {
  readonly #enqueue: (message: OutboxMessage) => void;

  constructor(enqueue: (message: OutboxMessage) => void) {
    this.#enqueue = enqueue;
  }

  send(reply: KitchenReply, sagaId: string): void {
    this.#enqueue(toKitchenReplyMessage(reply, sagaId));
  }
}
