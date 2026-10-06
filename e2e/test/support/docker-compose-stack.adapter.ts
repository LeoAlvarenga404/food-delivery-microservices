import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { runInComposeProject } from './compose-project.adapter.ts';

const electionDeadlineInMilliseconds = 90_000;
const electionRetryPauseInMilliseconds = 2_000;
const electionAttemptTimeoutInMilliseconds = 30_000;
const sagaStepPollIntervalInMilliseconds = 500;
const deadLetterReadTimeoutInMilliseconds = 15_000;
const kafkaToolPrefix = ['exec', '-T', 'kafka-1'];
const kafkaBootstrapServer = ['--bootstrap-server', 'kafka-1:29092'];
const electionCommand = [
  ...kafkaToolPrefix,
  '/opt/kafka/bin/kafka-leader-election.sh',
  ...kafkaBootstrapServer,
  '--election-type',
  'preferred',
  '--all-topic-partitions',
];
const keyedRecordLine = /^Partition:(\d+)\t(\S+)$/;
const messageTypeHeader = /(?:^|,)message-type:([^,]+)/;

function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const output = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '';
  return output === '' ? error.message : `${error.message}\n${output}`;
}

export class DockerComposeStack {
  async stopService(serviceName: string): Promise<void> {
    await this.#compose(['stop', serviceName]);
  }

  async killService(serviceName: string): Promise<void> {
    await this.#compose(['kill', serviceName]);
  }

  async startService(serviceName: string): Promise<void> {
    await this.#compose(['up', '--detach', '--wait', serviceName]);
  }

  async readTicketStatus(orderId: string): Promise<string> {
    const query = `select status from tickets where order_id = '${z.uuid().parse(orderId)}'`;
    return this.#queryDatabase('kitchen-db', 'kitchen_service', query);
  }

  async waitForSagaStep(
    orderId: string,
    step: string,
    limitInMilliseconds = 60_000,
  ): Promise<void> {
    const query = `select step from saga_instances where order_id = '${z.uuid().parse(orderId)}'`;
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    let lastStep = 'no saga';
    while (Date.now() < deadlineInMilliseconds) {
      lastStep = await this.#queryDatabase('order-db', 'order_service', query);
      if (lastStep === step) return;
      await delay(sagaStepPollIntervalInMilliseconds);
    }
    throw new Error(
      `saga of order ${orderId} did not reach ${step} in time; last seen ${lastStep}`,
    );
  }

  async findActiveKafkaController(askedNode = 'kafka-1'): Promise<string> {
    const output = await this.#compose([
      ...['exec', '-T', askedNode],
      '/opt/kafka/bin/kafka-metadata-quorum.sh',
      ...['--bootstrap-server', `${askedNode}:29092`],
      'describe',
      '--status',
    ]);
    const leaderId = /^LeaderId:\s+(\d+)$/m.exec(output)?.[1];
    if (leaderId === undefined) throw new Error(`no active Kafka controller in:\n${output}`);
    return `kafka-${leaderId}`;
  }

  async readPartitionsByKey(topic: string): Promise<ReadonlyMap<string, number>> {
    const output = await this.#compose([
      ...kafkaToolPrefix,
      '/opt/kafka/bin/kafka-console-consumer.sh',
      ...kafkaBootstrapServer,
      '--topic',
      topic,
      '--from-beginning',
      '--timeout-ms',
      String(deadLetterReadTimeoutInMilliseconds),
      ...['--formatter-property', 'print.partition=true', '--formatter-property', 'print.key=true'],
      ...['--formatter-property', 'print.value=false'],
    ]);
    const partitionsByKey = new Map<string, number>();
    for (const line of output.split('\n')) {
      const [, partition, key] = keyedRecordLine.exec(line.trim()) ?? [];
      if (partition !== undefined && key !== undefined) partitionsByKey.set(key, Number(partition));
    }
    return partitionsByKey;
  }

  async readMessageTypesByKey(topic: string): Promise<ReadonlyMap<string, readonly string[]>> {
    const output = await this.#compose([
      ...kafkaToolPrefix,
      '/opt/kafka/bin/kafka-console-consumer.sh',
      ...kafkaBootstrapServer,
      '--topic',
      topic,
      '--from-beginning',
      '--timeout-ms',
      String(deadLetterReadTimeoutInMilliseconds),
      ...['--formatter-property', 'print.headers=true', '--formatter-property', 'print.key=true'],
      ...['--formatter-property', 'print.value=false'],
    ]);
    const messageTypesByKey = new Map<string, string[]>();
    for (const line of output.split('\n')) {
      const [headers = '', key = ''] = line.trim().split('\t');
      const messageType = messageTypeHeader.exec(headers)?.[1];
      if (messageType !== undefined && key !== '') {
        messageTypesByKey.set(key, [...(messageTypesByKey.get(key) ?? []), messageType]);
      }
    }
    return messageTypesByKey;
  }

  async describeTopicConfiguration(topic: string): Promise<string> {
    return this.#compose([
      ...kafkaToolPrefix,
      '/opt/kafka/bin/kafka-configs.sh',
      ...kafkaBootstrapServer,
      '--entity-type',
      'topics',
      '--entity-name',
      topic,
      '--describe',
    ]);
  }

  async electPreferredLeaders(): Promise<void> {
    const deadlineInMilliseconds = Date.now() + electionDeadlineInMilliseconds;
    let lastFailure = 'no attempt was made';
    while (Date.now() < deadlineInMilliseconds) {
      try {
        await this.#compose(electionCommand, electionAttemptTimeoutInMilliseconds);
        return;
      } catch (error) {
        lastFailure = describeFailure(error);
        await delay(electionRetryPauseInMilliseconds);
      }
    }
    throw new Error(`preferred leader election did not succeed: ${lastFailure}`);
  }

  async readLogLinesSince(
    serviceNames: readonly string[],
    since: Date,
  ): Promise<readonly string[]> {
    const output = await this.#compose([
      'logs',
      '--no-color',
      '--no-log-prefix',
      '--since',
      since.toISOString(),
      ...serviceNames,
    ]);
    return output.split('\n');
  }

  async #queryDatabase(serviceName: string, databaseName: string, query: string): Promise<string> {
    const output = await this.#compose([
      'exec',
      '-T',
      serviceName,
      'psql',
      `--username=${databaseName}`,
      `--dbname=${databaseName}`,
      '--tuples-only',
      '--no-align',
      `--command=${query}`,
    ]);
    return output.trim();
  }

  async #compose(commandArguments: readonly string[], timeoutInMilliseconds = 0): Promise<string> {
    return runInComposeProject(commandArguments, timeoutInMilliseconds);
  }
}
