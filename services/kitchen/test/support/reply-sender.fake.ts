import type { KitchenReply, ReplySender } from '#application/ports/reply-sender.port.ts';

export interface SentReply {
  readonly reply: KitchenReply;
  readonly sagaId: string;
}

export class FakeReplySender implements ReplySender {
  readonly sentReplies: SentReply[] = [];

  send(reply: KitchenReply, sagaId: string): void {
    this.sentReplies.push({ reply, sagaId });
  }
}
