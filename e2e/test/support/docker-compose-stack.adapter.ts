import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const composeFilePath = fileURLToPath(new URL('../../../infra/compose.yaml', import.meta.url));
const electionDeadlineInMilliseconds = 90_000;
const electionRetryPauseInMilliseconds = 2_000;
const electionAttemptTimeoutInMilliseconds = 30_000;
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

  async #compose(commandArguments: readonly string[], timeoutInMilliseconds = 0): Promise<void> {
    await runFile(
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
  }
}
