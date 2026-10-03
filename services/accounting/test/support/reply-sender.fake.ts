import type { AccountingReply, ReplySender } from '#application/ports/reply-sender.port.ts';

export interface SentReply {
  readonly reply: AccountingReply;
  readonly sagaId: string;
}

export class FakeReplySender implements ReplySender {
  readonly sentReplies: SentReply[] = [];

  send(reply: AccountingReply, sagaId: string): void {
    this.sentReplies.push({ reply, sagaId });
  }
}
