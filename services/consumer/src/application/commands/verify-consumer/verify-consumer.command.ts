import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { ConsumerId } from '#domain/consumer/consumer-id.value-object.ts';
import type { ConsumerBlocked } from '#domain/consumer/consumer.aggregate.ts';

export interface VerifyConsumerCommand {
  readonly consumerId: ConsumerId;
  readonly orderId: string;
  readonly sagaId: string;
  readonly metadata: MessageMetadata;
}

export interface ConsumerNotFound {
  readonly type: 'ConsumerNotFound';
  readonly consumerId: ConsumerId;
}

export type VerifyConsumerError = ConsumerNotFound | ConsumerBlocked;
