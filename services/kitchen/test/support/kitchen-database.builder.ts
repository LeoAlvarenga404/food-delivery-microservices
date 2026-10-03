import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import { kitchenMigrationSources } from '#infrastructure/persistence/kitchen-migration-sources.config.ts';

export interface KitchenTestDatabase {
  readonly database: Kysely<KitchenDatabase>;
  readonly clearWrittenRows: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function startKitchenTestDatabase(): Promise<KitchenTestDatabase> {
  const postgres = await startPostgresContainer();
  const database = createDatabase<KitchenDatabase>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 5,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, kitchenMigrationSources);
  return {
    database,
    clearWrittenRows: async () => {
      await sql`truncate tickets, outbox, inbox`.execute(database);
    },
    stop: async () => {
      await database.destroy();
      await postgres.stop();
    },
  };
}
