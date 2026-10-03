import { create, toBinary, type DescMessage, type MessageInitShape } from '@bufbuild/protobuf';
import type { InboundMessage, MessageHeaders } from '@fd/chassis-kafka';

let builtMessageCount = 0;

function nextMessageId(): string {
  builtMessageCount += 1;
  return `0199a5d0-0000-7000-8000-${(0xd00 + builtMessageCount).toString(16).padStart(12, '0')}`;
}

export function buildCommandMessage<Schema extends DescMessage>(
  schema: Schema,
  command: MessageInitShape<Schema>,
  headers: Partial<MessageHeaders> = {},
): InboundMessage {
  return {
    topic: 'consumer.commands',
    partition: 0,
    offset: '0',
    key: undefined,
    payload: toBinary(schema, create(schema, command)),
    headers: {
      messageId: nextMessageId(),
      messageType: schema.typeName,
      correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
      causationId: '0199a5d0-0000-7000-8000-0000000000b0',
      sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
      actorId: undefined,
      actorType: undefined,
      ...headers,
    },
  };
}
