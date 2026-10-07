import { createDatabase, migrateToLatest } from '@fd/chassis-postgres';
import { startPostgresContainer } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import { orderMigrationSources } from '#infrastructure/persistence/order-migration-sources.config.ts';
import { PostgresRestaurantMenuRepository } from '#infrastructure/persistence/postgres-restaurant-menu.repository.ts';
import { pizzeriaMenu } from './order.builder.ts';

export interface OrderTestDatabase {
  readonly database: Kysely<OrderDatabase>;
  readonly connectionUri: string;
  readonly clearWrittenRows: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function startOrderTestDatabase(): Promise<OrderTestDatabase> {
  const postgres = await startPostgresContainer();
  const database = createDatabase<OrderDatabase>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 5,
    onConnectionError: () => undefined,
  });
  await migrateToLatest(database, orderMigrationSources);
  await new PostgresRestaurantMenuRepository(database).saveIfNewer(pizzeriaMenu);
  return {
    database,
    connectionUri: postgres.connectionUri,
    clearWrittenRows: async () => {
      await sql`truncate order_line_items, orders, idempotency_keys, saga_instances, outbox, inbox`.execute(
        database,
      );
    },
    stop: async () => {
      await database.destroy();
      await postgres.stop();
    },
  };
}
