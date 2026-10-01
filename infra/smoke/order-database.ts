import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const composeFile = fileURLToPath(new URL('../compose.yaml', import.meta.url));

export function runOrderDatabaseSql(databaseName: string, sql: string): string {
  return execFileSync(
    'docker',
    ['compose', '-f', composeFile, '--profile', 'core', 'exec', '-T', 'order-db'].concat([
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-qtA',
      '-U',
      'order_service',
      '-d',
      databaseName,
    ]),
    { input: sql, encoding: 'utf8' },
  );
}
