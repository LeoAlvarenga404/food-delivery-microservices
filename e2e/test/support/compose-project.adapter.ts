import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const outputLimitInBytes = 64 * 1024 * 1024;
const composeFilePath = fileURLToPath(new URL('../../../infra/compose.yaml', import.meta.url));
const composeProjectName = process.env['COMPOSE_PROJECT_NAME'] ?? 'food-delivery';
const profileArguments = ['core', 'auth', 'search', 'apps'].flatMap((profile) => [
  '--profile',
  profile,
]);
let runningEdge: Promise<void> | undefined;

async function runCompose(
  commandArguments: readonly string[],
  timeoutInMilliseconds: number,
): Promise<string> {
  const { stdout } = await runFile(
    'docker',
    ['compose', '--file', composeFilePath, ...profileArguments, ...commandArguments],
    { timeout: timeoutInMilliseconds, maxBuffer: outputLimitInBytes },
  );
  return stdout;
}

async function requireRunningEdge(): Promise<void> {
  const runningEnvoy = await runCompose(['ps', '--status', 'running', '--quiet', 'envoy'], 0);
  if (runningEnvoy.trim() === '') {
    throw new Error(
      `compose project ${composeProjectName} runs no envoy, so it is not the stack under test; export COMPOSE_PROJECT_NAME with the project that pnpm stack:up started`,
    );
  }
}

export async function runInComposeProject(
  commandArguments: readonly string[],
  timeoutInMilliseconds = 0,
): Promise<string> {
  runningEdge ??= requireRunningEdge();
  await runningEdge;
  return runCompose(commandArguments, timeoutInMilliseconds);
}
