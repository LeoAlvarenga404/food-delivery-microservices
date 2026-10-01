import type { KafkaJS } from '@confluentinc/kafka-javascript';
import { parseMessageHeaders, type MessageHeaders } from './message-headers.ts';

export interface InboundMessage {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
  readonly key: string | undefined;
  readonly payload: Uint8Array;
  readonly headers: MessageHeaders;
}

export type MessageHandler = (message: InboundMessage) => Promise<void>;

export function toInboundMessage(delivery: KafkaJS.EachMessagePayload): InboundMessage {
  const { topic, partition, message } = delivery;
  return {
    topic,
    partition,
    offset: message.offset,
    key: message.key?.toString(),
    payload: message.value ?? new Uint8Array(),
    headers: parseMessageHeaders(message.headers ?? {}),
  };
}
