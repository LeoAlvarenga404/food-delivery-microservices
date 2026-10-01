import { execFileSync } from 'node:child_process';

export function listRepositoryFiles(): readonly string[] {
  const gitOutput = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  );
  return gitOutput.split('\0').filter((path) => path.length > 0);
}
