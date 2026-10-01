import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { KafkaJS } from '@confluentinc/kafka-javascript';
import { createLogger } from '@fd/chassis-observability';
import { startKafkaContainer, type StartedKafka } from '@fd/chassis-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKafka } from './create-kafka.ts';
import type { InboundMessage, MessageHandler } from './inbound-message.ts';
import { startConsumerRunner, type RunningConsumer } from './kafka-consumer-runner.ts';

const silentLogger = createLogger({ serviceName: 'runner-test', level: 'silent' });

let kafkaContainer: StartedKafka;
let kafka: KafkaJS.Kafka;
let admin: KafkaJS.Admin;
let producer: KafkaJS.Producer;

function headersFor(messageType: string): KafkaJS.IHeaders {
  return {
    'message-id': randomUUID(),
    'message-type': messageType,
    'correlation-id': randomUUID(),
  };
}

async function createTopics(sourceTopic: string, groupId: string): Promise<void> {
  await admin.createTopics({
    topics: [sourceTopic, `${sourceTopic}.${groupId}.dlq`].map((topic) => ({
      topic,
      numPartitions: 1,
      replicationFactor: 1,
    })),
  });
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met within 30 seconds');
    await setTimeout(50);
  }
}

async function committedOffset(groupId: string, topic: string): Promise<string | undefined> {
  const [topicOffsets] = await admin.fetchOffsets({ groupId, topics: [topic] });
  return topicOffsets?.partitions[0]?.offset;
}

async function readFirstMessage(topic: string): Promise<KafkaJS.KafkaMessage> {
  const reader = kafka.consumer({
    kafkaJS: { groupId: `reader-${randomUUID()}`, fromBeginning: true },
  });
  await reader.connect();
  await reader.subscribe({ topic });
  const received: KafkaJS.KafkaMessage[] = [];
  await reader.run({
    eachMessage: ({ message }) => {
      received.push(message);
      return Promise.resolve();
    },
  });
  await waitUntil(() => received.length > 0);
  await reader.disconnect();
  const [first] = received;
  if (first === undefined) throw new Error(`no message on ${topic}`);
  return first;
}

function headerOf(message: KafkaJS.KafkaMessage, name: string): string | undefined {
  return message.headers?.[name]?.toString();
}

function payloadText(message: InboundMessage): string {
  return Buffer.from(message.payload).toString();
}

async function runScenario(
  name: string,
  handle: MessageHandler,
  messages: readonly KafkaJS.Message[],
): Promise<{ readonly topic: string; readonly groupId: string; readonly runner: RunningConsumer }> {
  const topic = `${name}.commands`;
  const groupId = `${name}-service`;
  await createTopics(topic, groupId);
  await producer.send({ topic, messages: [...messages] });
  const runner = await startConsumerRunner({
    kafka,
    groupId,
    topics: [topic],
    handle,
    logger: silentLogger,
  });
  return { topic, groupId, runner };
}

beforeAll(async () => {
  kafkaContainer = await startKafkaContainer();
  kafka = createKafka({
    clientId: 'runner-test',
    bootstrapServers: [kafkaContainer.bootstrapServer],
  });
  admin = kafka.admin();
  producer = kafka.producer({ kafkaJS: { acks: -1, idempotent: true } });
  await admin.connect();
  await producer.connect();
});

afterAll(async () => {
  await producer.disconnect();
  await admin.disconnect();
  await kafkaContainer.stop();
});

describe('startConsumerRunner', () => {
  it('refuses to start when a dead letter topic is missing', async () => {
    await admin.createTopics({
      topics: [{ topic: 'orphan.commands', numPartitions: 1, replicationFactor: 1 }],
    });

    const starting = startConsumerRunner({
      kafka,
      groupId: 'orphan-service',
      topics: ['orphan.commands'],
      handle: () => Promise.resolve(),
      logger: silentLogger,
    });

    await expect(starting).rejects.toThrow(
      'missing dead letter topics: orphan.commands.orphan-service.dlq',
    );
  });

  it('handles messages in order and commits each offset after the handler resolves', async () => {
    const handled: string[] = [];
    const scenario = await runScenario(
      'ordered',
      (message) => {
        handled.push(payloadText(message));
        return Promise.resolve();
      },
      ['m0', 'm1', 'm2'].map((text) => ({
        key: 'order-1',
        value: text,
        headers: headersFor('Sample'),
      })),
    );

    await waitUntil(() => handled.length === 3);
    await scenario.runner.stop();

    expect(handled).toEqual(['m0', 'm1', 'm2']);
    expect(await committedOffset(scenario.groupId, scenario.topic)).toBe('3');
  });

  it('retries a transient failure on the same message without letting later ones overtake it', async () => {
    const handled: string[] = [];
    let remainingFailures = 2;
    const scenario = await runScenario(
      'transient',
      (message) => {
        handled.push(payloadText(message));
        if (payloadText(message) !== 'm1' || remainingFailures === 0) return Promise.resolve();
        remainingFailures -= 1;
        return Promise.reject(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
      },
      ['m0', 'm1', 'm2'].map((text) => ({
        key: 'order-1',
        value: text,
        headers: headersFor('Sample'),
      })),
    );

    await waitUntil(() => handled.includes('m2'));
    await scenario.runner.stop();

    expect(handled).toEqual(['m0', 'm1', 'm1', 'm1', 'm2']);
    expect(await committedOffset(scenario.groupId, scenario.topic)).toBe('3');
  });

  it('dead-letters a message without required headers immediately and moves on', async () => {
    const handled: string[] = [];
    const scenario = await runScenario(
      'undecodable',
      (message) => {
        handled.push(payloadText(message));
        return Promise.resolve();
      },
      [
        { key: 'order-1', value: 'broken', headers: { 'message-id': randomUUID() } },
        { key: 'order-1', value: 'valid', headers: headersFor('Sample') },
      ],
    );

    await waitUntil(() => handled.includes('valid'));
    await scenario.runner.stop();
    const deadLetter = await readFirstMessage(`${scenario.topic}.${scenario.groupId}.dlq`);

    expect(handled).toEqual(['valid']);
    expect(deadLetter.key?.toString()).toBe('order-1');
    expect(deadLetter.value?.toString()).toBe('broken');
    expect(headerOf(deadLetter, 'error-class')).toBe('permanent');
    expect(headerOf(deadLetter, 'error-message')).toBe('missing required header message-type');
    expect(headerOf(deadLetter, 'original-topic')).toBe(scenario.topic);
    expect(headerOf(deadLetter, 'original-offset')).toBe('0');
    expect(headerOf(deadLetter, 'attempt-count')).toBe('1');
  });

  it('dead-letters an unknown failure after five attempts', async () => {
    let attemptCount = 0;
    const scenario = await runScenario(
      'unknown',
      () => {
        attemptCount += 1;
        return Promise.reject(new Error('unexpected bug'));
      },
      [{ key: 'order-1', value: 'poison', headers: headersFor('Sample') }],
    );

    const deadLetter = await readFirstMessage(`${scenario.topic}.${scenario.groupId}.dlq`);
    await scenario.runner.stop();

    expect(attemptCount).toBe(5);
    expect(headerOf(deadLetter, 'error-class')).toBe('unknown');
    expect(headerOf(deadLetter, 'error-message')).toBe('unexpected bug');
    expect(headerOf(deadLetter, 'attempt-count')).toBe('5');
    expect(await committedOffset(scenario.groupId, scenario.topic)).toBe('1');
  });
});
