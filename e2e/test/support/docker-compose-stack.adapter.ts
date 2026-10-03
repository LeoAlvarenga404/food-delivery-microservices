import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const composeFile = fileURLToPath(new URL('../../../infra/compose.yaml', import.meta.url));
const electionDeadlineMilliseconds = 90_000;
const electionRetryPauseMilliseconds = 2_000;
const electionCommand = [
  'exec',
  '-T',
  'kafka-1',
  '/opt/kafka/bin/kafka-leader-election.sh',
  '--bootstrap-server',
  'kafka-1:29092',
  '--election-type',
  'preferred',
  '--all-topic-partitions',
];

export class DockerComposeStack {
  async stopService(serviceName: string): Promise<void> {
    await this.#compose(['stop', serviceName]);
  }

  async startService(serviceName: string): Promise<void> {
    await this.#compose(['up', '--detach', '--wait', serviceName]);
  }

  async electPreferredLeaders(): Promise<void> {
    const deadlineTimestampMilliseconds = Date.now() + electionDeadlineMilliseconds;
    let lastFailure = 'no attempt was made';
    while (Date.now() < deadlineTimestampMilliseconds) {
      try {
        await this.#compose(electionCommand);
        return;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        await setTimeout(electionRetryPauseMilliseconds);
      }
    }
    throw new Error(`preferred leader election did not succeed: ${lastFailure}`);
  }

  async #compose(commandArguments: readonly string[]): Promise<void> {
    await runFile('docker', [
      'compose',
      '--file',
      composeFile,
      '--profile',
      'core',
      '--profile',
      'apps',
      ...commandArguments,
    ]);
  }
}
