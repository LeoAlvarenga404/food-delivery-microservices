import { PostgreSqlContainer } from '@testcontainers/postgresql';

export interface StartedPostgres {
  readonly connectionUri: string;
  readonly stop: () => Promise<void>;
}

const postgresImage = 'postgres:18.6-alpine';

export async function startPostgresContainer(): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer(postgresImage).start();
  return {
    connectionUri: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
