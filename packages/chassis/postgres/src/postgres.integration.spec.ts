import { startPostgresContainer, type StartedPostgres } from '@fd/chassis-testing';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './create-database.ts';
import { migrateToLatest, type MigrationSource } from './migrate-to-latest.ts';

interface StockItemsTable {
  readonly stockItemId: string;
  readonly quantityOnHand: bigint;
  readonly reorderLevel: bigint;
}

interface InventorySchema {
  readonly stockItems: StockItemsTable;
}

const inventoryMigrations: MigrationSource = {
  name: 'inventory',
  directory: new URL('../test-migrations/inventory/', import.meta.url),
};

const catalogueMigrations: MigrationSource = {
  name: 'catalogue',
  directory: new URL('../test-migrations/catalogue/', import.meta.url),
};

let postgres: StartedPostgres;
let database: Kysely<InventorySchema>;

beforeAll(async () => {
  postgres = await startPostgresContainer();
  database = createDatabase<InventorySchema>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount: 2,
  });
});

afterAll(async () => {
  await database.destroy();
  await postgres.stop();
});

describe('migrateToLatest', () => {
  it('applies the SQL files of every source once, prefixed by the source name', async () => {
    const applied = await migrateToLatest(database, [inventoryMigrations, catalogueMigrations]);
    const appliedAgain = await migrateToLatest(database, [
      inventoryMigrations,
      catalogueMigrations,
    ]);

    expect(applied).toEqual([
      'catalogue/0001-create-products-table',
      'inventory/0001-create-stock-items-table',
      'inventory/0002-add-reorder-level',
    ]);
    expect(appliedAgain).toEqual([]);
  });

  it('reports a failing migration with its cause', async () => {
    const brokenMigrations: MigrationSource = {
      name: 'broken',
      directory: new URL('../test-migrations/broken/', import.meta.url),
    };

    const failure = await migrateToLatest(database, [
      inventoryMigrations,
      catalogueMigrations,
      brokenMigrations,
    ]).catch((error: unknown) => error);

    expect(failure).toHaveProperty('message', 'database migration failed');
    expect(failure).toHaveProperty('cause.message', 'relation "missing_table" does not exist');
  });

  it('refuses to run when a source that was already applied is left out', async () => {
    const failure = await migrateToLatest(database, [inventoryMigrations]).catch(
      (error: unknown) => error,
    );

    expect(failure).toHaveProperty('message', 'database migration failed');
    expect(failure).toHaveProperty(
      'cause.message',
      'corrupted migrations: previously executed migration catalogue/0001-create-products-table is missing',
    );
  });
});

describe('createDatabase', () => {
  it('maps snake_case columns to camelCase properties and bigint columns to bigint', async () => {
    await database
      .insertInto('stockItems')
      .values({
        stockItemId: 'pizza-dough',
        quantityOnHand: 9_007_199_254_740_993n,
        reorderLevel: 10n,
      })
      .execute();

    const stockItem = await database
      .selectFrom('stockItems')
      .selectAll()
      .where('stockItemId', '=', 'pizza-dough')
      .executeTakeFirstOrThrow();

    expect(stockItem).toEqual({
      stockItemId: 'pizza-dough',
      quantityOnHand: 9_007_199_254_740_993n,
      reorderLevel: 10n,
    });
  });
});
