import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const composeFile = fileURLToPath(new URL('../../../infra/compose.yaml', import.meta.url));

export class DockerComposeStack {
  async stopService(serviceName: string): Promise<void> {
    await this.#compose(['stop', serviceName]);
  }

  async startService(serviceName: string): Promise<void> {
    await this.#compose(['up', '--detach', '--wait', serviceName]);
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
