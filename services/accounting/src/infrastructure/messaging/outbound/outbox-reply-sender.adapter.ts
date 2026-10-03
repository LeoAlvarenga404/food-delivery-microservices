import type { OutboxMessage } from '@fd/chassis-outbox';
import type { AccountingReply, ReplySender } from '#application/ports/reply-sender.port.ts';
import { toAccountingReplyMessage } from './accounting-reply.message-mapper.ts';

export class OutboxReplySender implements ReplySender {
  readonly #enqueue: (message: OutboxMessage) => void;

  constructor(enqueue: (message: OutboxMessage) => void) {
    this.#enqueue = enqueue;
  }

  send(reply: AccountingReply, sagaId: string): void {
    this.#enqueue(toAccountingReplyMessage(reply, sagaId));
  }
}
