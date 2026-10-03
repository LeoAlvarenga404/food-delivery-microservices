import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import { accountingMigrationSources } from '#infrastructure/persistence/accounting-migration-sources.config.ts';
import type { DB as AccountingDatabase } from '#infrastructure/persistence/generated/database.ts';

export interface AccountingTestDatabase {
  readonly database: Kysely<AccountingDatabase>;
  readonly clearWrittenRows: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function startAccountingTestDatabase(): Promise<AccountingTestDatabase> {
  const postgres = await startPostgresContainer();
  const database = createDatabase<AccountingDatabase>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 5,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, accountingMigrationSources);
  return {
    database,
    clearWrittenRows: async () => {
      await sql`truncate payments, outbox, inbox`.execute(database);
    },
    stop: async () => {
      await database.destroy();
      await postgres.stop();
    },
  };
}
