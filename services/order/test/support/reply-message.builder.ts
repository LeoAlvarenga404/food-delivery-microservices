import { create, toBinary, type DescMessage, type MessageInitShape } from '@bufbuild/protobuf';
import type { InboundMessage, MessageHeaders } from '@fd/chassis-kafka';

let builtMessageCount = 0;

function nextMessageId(): string {
  builtMessageCount += 1;
  return `0199a5d0-0000-7000-8000-${(0xd00 + builtMessageCount).toString(16).padStart(12, '0')}`;
}

export function buildReplyMessage<Schema extends DescMessage>(
  schema: Schema,
  reply: MessageInitShape<Schema>,
  headers: Partial<MessageHeaders> = {},
): InboundMessage {
  const sagaId = headers.sagaId ?? '0199a5d0-0000-7000-8000-0000000000b1';
  return {
    topic: 'order.place-order-saga.replies',
    partition: 0,
    offset: '0',
    key: sagaId,
    payload: toBinary(schema, create(schema, reply)),
    headers: {
      messageId: nextMessageId(),
      messageType: schema.typeName,
      correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
      causationId: undefined,
      traceparent: undefined,
      actorId: undefined,
      actorType: undefined,
      ...headers,
      sagaId,
    },
  };
}
