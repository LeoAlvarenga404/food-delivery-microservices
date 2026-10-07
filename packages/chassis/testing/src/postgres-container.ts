import { setTimeout } from 'node:timers/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export interface StartedPostgres {
  readonly connectionUri: string;
  readonly stop: () => Promise<void>;
}

const postgresImage = 'postgres:18.6-alpine';
const disconnectionLimitInMilliseconds = 5000;
const pollIntervalInMilliseconds = 50;
const otherClientCountQuery =
  "select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid()";

async function hasOtherClients(container: StartedPostgreSqlContainer): Promise<boolean> {
  const { output } = await container.exec([
    'psql',
    '--username',
    container.getUsername(),
    '--dbname',
    container.getDatabase(),
    '--tuples-only',
    '--no-align',
    '--command',
    otherClientCountQuery,
  ]);
  return output.trim() !== '0';
}

async function waitForClientsToDisconnect(container: StartedPostgreSqlContainer): Promise<void> {
  const deadlineInMilliseconds = Date.now() + disconnectionLimitInMilliseconds;
  while (Date.now() < deadlineInMilliseconds && (await hasOtherClients(container))) {
    await setTimeout(pollIntervalInMilliseconds);
  }
}

export async function startPostgresContainer(): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer(postgresImage).start();
  return {
    connectionUri: container.getConnectionUri(),
    stop: async () => {
      await waitForClientsToDisconnect(container);
      await container.stop();
    },
  };
}
