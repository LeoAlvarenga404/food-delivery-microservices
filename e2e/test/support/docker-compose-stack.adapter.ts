import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';

const runFile = promisify(execFile);
const composeFilePath = fileURLToPath(new URL('../../../infra/compose.yaml', import.meta.url));
const electionDeadlineInMilliseconds = 90_000;
const electionRetryPauseInMilliseconds = 2_000;
const electionAttemptTimeoutInMilliseconds = 30_000;
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

  async startService(serviceName: string): Promise<void> {
    await this.#compose(['up', '--detach', '--wait', serviceName]);
  }

  async readTicketStatus(orderId: string): Promise<string> {
    const query = `select status from tickets where order_id = '${z.uuid().parse(orderId)}'`;
    const output = await this.#compose([
      'exec',
      '-T',
      'kitchen-db',
      'psql',
      '--username=kitchen_service',
      '--dbname=kitchen_service',
      '--tuples-only',
      '--no-align',
      `--command=${query}`,
    ]);
    return output.trim();
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
      '5000',
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

  async #compose(commandArguments: readonly string[], timeoutInMilliseconds = 0): Promise<string> {
    const { stdout } = await runFile(
      'docker',
      [
        'compose',
        '--file',
        composeFilePath,
        '--profile',
        'core',
        '--profile',
        'apps',
        ...commandArguments,
      ],
      { timeout: timeoutInMilliseconds },
    );
    return stdout;
  }
}
