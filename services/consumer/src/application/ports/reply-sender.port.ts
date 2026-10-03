import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';

export interface ConsumerVerifiedReply {
  readonly type: 'ConsumerVerified';
  readonly consumerId: ConsumerId;
  readonly orderId: string;
}

export interface ConsumerVerificationFailedReply {
  readonly type: 'ConsumerVerificationFailed';
  readonly consumerId: ConsumerId;
  readonly orderId: string;
  readonly reason: 'ConsumerNotFound' | 'ConsumerBlocked';
}

export type ConsumerReply = ConsumerVerifiedReply | ConsumerVerificationFailedReply;

export interface ReplySender {
  send(reply: ConsumerReply, sagaId: string): void;
}
