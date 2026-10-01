import type { KafkaJS } from '@confluentinc/kafka-javascript';

export interface ReceivedMessage {
  readonly key: string;
  readonly payloadHex: string;
  readonly headers: Readonly<Record<string, string>>;
}

const receiveTimeoutInMilliseconds = 60_000;

function headerText(header: KafkaJS.IHeaders[string]): string {
  if (header === undefined) return '';
  return Array.isArray(header) ? header.map(String).join(',') : header.toString();
}

function toReceivedMessage(message: KafkaJS.KafkaMessage): ReceivedMessage {
  const headerEntries = Object.entries(message.headers ?? {});
  return {
    key: message.key?.toString() ?? '',
    payloadHex: message.value?.toString('hex') ?? '',
    headers: Object.fromEntries(headerEntries.map(([name, header]) => [name, headerText(header)])),
  };
}

function waitForMessage(consumer: KafkaJS.Consumer, messageId: string): Promise<ReceivedMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `message ${messageId} did not arrive within ${String(receiveTimeoutInMilliseconds)} ms`,
        ),
      );
    }, receiveTimeoutInMilliseconds);
    const eachMessage = ({ message }: KafkaJS.EachMessagePayload): Promise<void> => {
      const received = toReceivedMessage(message);
      if (received.headers['message-id'] === messageId) {
        clearTimeout(timer);
        resolve(received);
      }
      return Promise.resolve();
    };
    consumer.run({ eachMessage }).catch(reject);
  });
}

export async function receiveSmokeMessage(
  kafka: KafkaJS.Kafka,
  topic: string,
  messageId: string,
): Promise<ReceivedMessage> {
  const groupId = `outbox-smoke-${String(Date.now())}`;
  const consumer = kafka.consumer({ kafkaJS: { groupId, fromBeginning: true } });
  await consumer.connect();
  try {
    await consumer.subscribe({ topic });
    return await waitForMessage(consumer, messageId);
  } finally {
    await consumer.disconnect();
  }
}
