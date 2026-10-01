import type { KafkaJS } from '@confluentinc/kafka-javascript';
import type { Logger } from '@fd/chassis-observability';
import { deadLetterRecord, deadLetterTopic } from './dead-letter.ts';
import { classifyFailure, decideFailureHandling } from './failure-handling.ts';
import { toInboundMessage, type MessageHandler } from './inbound-message.ts';

export interface ConsumerRunnerSettings {
  readonly kafka: KafkaJS.Kafka;
  readonly groupId: string;
  readonly topics: readonly string[];
  readonly handle: MessageHandler;
  readonly logger: Logger;
}

export interface RunningConsumer {
  readonly stop: () => Promise<void>;
}

interface RunnerParts {
  readonly settings: ConsumerRunnerSettings;
  readonly consumer: KafkaJS.Consumer;
  readonly producer: KafkaJS.Producer;
  readonly attemptCounts: Map<string, number>;
  readonly resumeTimers: Set<NodeJS.Timeout>;
  readonly lifecycle: { isStopRequested: boolean };
}

function deliveryKey(delivery: KafkaJS.EachMessagePayload): string {
  return `${delivery.topic}:${String(delivery.partition)}:${delivery.message.offset}`;
}

async function commitDelivery(
  parts: RunnerParts,
  delivery: KafkaJS.EachMessagePayload,
): Promise<void> {
  parts.attemptCounts.delete(deliveryKey(delivery));
  const nextOffset = String(BigInt(delivery.message.offset) + 1n);
  await parts.consumer.commitOffsets([
    { topic: delivery.topic, partition: delivery.partition, offset: nextOffset },
  ]);
}

function scheduleRetry(
  parts: RunnerParts,
  delivery: KafkaJS.EachMessagePayload,
  delayInMilliseconds: number,
): void {
  if (parts.lifecycle.isStopRequested) return;
  const { topic, partition } = delivery;
  parts.consumer.pause([{ topic, partitions: [partition] }]);
  parts.consumer.seek({ topic, partition, offset: delivery.message.offset });
  const timer = setTimeout(() => {
    parts.resumeTimers.delete(timer);
    if (!parts.lifecycle.isStopRequested)
      parts.consumer.resume([{ topic, partitions: [partition] }]);
  }, delayInMilliseconds);
  parts.resumeTimers.add(timer);
}

async function handleFailure(
  parts: RunnerParts,
  delivery: KafkaJS.EachMessagePayload,
  error: unknown,
): Promise<void> {
  const attemptCount = (parts.attemptCounts.get(deliveryKey(delivery)) ?? 0) + 1;
  parts.attemptCounts.set(deliveryKey(delivery), attemptCount);
  const failureClass = classifyFailure(error);
  const handling = decideFailureHandling(failureClass, attemptCount);
  const context = { topic: delivery.topic, partition: delivery.partition, attemptCount };
  const offset = delivery.message.offset;
  if (handling.kind === 'retry') {
    parts.settings.logger.warn({ ...context, offset, failureClass, err: error }, 'retrying');
    scheduleRetry(parts, delivery, handling.delayInMilliseconds);
    return;
  }
  const record = deadLetterRecord(delivery, { failureClass, error, attemptCount });
  const topic = deadLetterTopic(delivery.topic, parts.settings.groupId);
  await parts.producer.send({ topic, messages: [record] });
  parts.settings.logger.error({ ...context, offset, failureClass, err: error }, 'dead-lettered');
  await commitDelivery(parts, delivery);
}

async function processDelivery(
  parts: RunnerParts,
  delivery: KafkaJS.EachMessagePayload,
): Promise<void> {
  try {
    await parts.settings.handle(toInboundMessage(delivery));
  } catch (error) {
    await handleFailure(parts, delivery, error);
    return;
  }
  await commitDelivery(parts, delivery);
}

async function ensureDeadLetterTopicsExist(settings: ConsumerRunnerSettings): Promise<void> {
  const admin = settings.kafka.admin();
  await admin.connect();
  try {
    const existingTopicNames = new Set(await admin.listTopics());
    const missingTopicNames = settings.topics
      .map((topic) => deadLetterTopic(topic, settings.groupId))
      .filter((topicName) => !existingTopicNames.has(topicName));
    if (missingTopicNames.length > 0) {
      throw new Error(`missing dead letter topics: ${missingTopicNames.join(', ')}`);
    }
  } finally {
    await admin.disconnect();
  }
}

function createRunnerParts(settings: ConsumerRunnerSettings): RunnerParts {
  return {
    settings,
    consumer: settings.kafka.consumer({
      kafkaJS: { groupId: settings.groupId, fromBeginning: true, autoCommit: false },
    }),
    producer: settings.kafka.producer({ kafkaJS: { acks: -1, idempotent: true } }),
    attemptCounts: new Map(),
    resumeTimers: new Set(),
    lifecycle: { isStopRequested: false },
  };
}

async function stopRunner(parts: RunnerParts): Promise<void> {
  parts.lifecycle.isStopRequested = true;
  await parts.consumer.disconnect();
  parts.resumeTimers.forEach((timer) => {
    clearTimeout(timer);
  });
  await parts.producer.disconnect();
}

export async function startConsumerRunner(
  settings: ConsumerRunnerSettings,
): Promise<RunningConsumer> {
  await ensureDeadLetterTopicsExist(settings);
  const parts = createRunnerParts(settings);
  await parts.producer.connect();
  await parts.consumer.connect();
  await parts.consumer.subscribe({ topics: [...settings.topics] });
  await parts.consumer.run({ eachMessage: (delivery) => processDelivery(parts, delivery) });
  return { stop: () => stopRunner(parts) };
}
