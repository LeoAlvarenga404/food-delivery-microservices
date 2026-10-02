import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import type { Consumer } from '#domain/consumer/consumer.aggregate.ts';
import { consumerMigrationSources } from '#infrastructure/persistence/consumer-migration-sources.config.ts';
import { consumerPersistenceMapper } from '#infrastructure/persistence/consumer.persistence-mapper.ts';
import type { DB as ConsumerDatabase } from '#infrastructure/persistence/generated/database.ts';

export interface ConsumerTestDatabase {
  readonly database: Kysely<ConsumerDatabase>;
  readonly storeConsumers: (consumers: readonly Consumer[]) => Promise<void>;
  readonly clearWrittenRows: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function startConsumerTestDatabase(): Promise<ConsumerTestDatabase> {
  const postgres = await startPostgresContainer();
  const database = createDatabase<ConsumerDatabase>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 5,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, consumerMigrationSources);
  return {
    database,
    storeConsumers: async (consumers) => {
      await database
        .insertInto('consumers')
        .values(consumers.map((consumer) => consumerPersistenceMapper.toPersistence(consumer)))
        .onConflict((conflict) => conflict.column('consumerId').doNothing())
        .execute();
    },
    clearWrittenRows: async () => {
      await sql`truncate outbox, inbox`.execute(database);
    },
    stop: async () => {
      await database.destroy();
      await postgres.stop();
    },
  };
}
