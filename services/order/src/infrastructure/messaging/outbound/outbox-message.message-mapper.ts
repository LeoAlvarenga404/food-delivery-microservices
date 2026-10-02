import { toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';

export interface MessageRouting {
  readonly topic: string;
  readonly orderId: string;
  readonly sagaId: string | undefined;
}

export function toOutboxMessage<Schema extends DescMessage>(
  schema: Schema,
  message: MessageShape<Schema>,
  routing: MessageRouting,
): OutboxMessage {
  return {
    topic: routing.topic,
    aggregateType: 'Order',
    aggregateId: routing.orderId,
    messageType: schema.typeName,
    payload: toBinary(schema, message),
    sagaId: routing.sagaId,
  };
}
