import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';

export interface ConsumerReply {
  readonly type: 'ConsumerVerified';
  readonly consumerId: ConsumerId;
  readonly orderId: string;
}

export interface ReplySender {
  send(reply: ConsumerReply, sagaId: string): void;
}
