import type { ConsumerReply, ReplySender } from '#application/ports/reply-sender.port.ts';

export interface SentReply {
  readonly reply: ConsumerReply;
  readonly sagaId: string;
}

export class FakeReplySender implements ReplySender {
  readonly sentReplies: SentReply[] = [];

  send(reply: ConsumerReply, sagaId: string): void {
    this.sentReplies.push({ reply, sagaId });
  }
}
