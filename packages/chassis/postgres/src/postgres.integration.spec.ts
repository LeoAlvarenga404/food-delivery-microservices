import { setTimeout } from 'node:timers/promises';
import { startPostgresContainer, type StartedPostgres } from '@fd/chassis-testing';
import { sql, type Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from './concurrency-conflict-error.ts';
import { createDatabase } from './create-database.ts';
import { DatabaseConnectionLostError } from './database-connection-lost-error.ts';
import { migrateToLatest, type MigrationSource } from './migrate-to-latest.ts';
import { runInTransaction } from './run-in-transaction.ts';

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
  directory: new URL('../test-migrations/catalogue', import.meta.url),
};

const maximumConnectionCount = 2;

let postgres: StartedPostgres;
let database: Kysely<InventorySchema>;
const connectionErrors: Error[] = [];

async function terminateOtherConnections(): Promise<void> {
  const administrator = new pg.Client({ connectionString: postgres.connectionUri });
  await administrator.connect();
  await administrator.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where pid <> pg_backend_pid() and datname = current_database()',
  );
  await administrator.end();
  await setTimeout(300);
}

beforeAll(async () => {
  postgres = await startPostgresContainer();
  database = createDatabase<InventorySchema>({
    connectionString: postgres.connectionUri,
    maximumConnectionCount,
    onConnectionError: (error) => {
      connectionErrors.push(error);
    },
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

  it('reports a failing migration with its name and cause', async () => {
    const brokenMigrations: MigrationSource = {
      name: 'broken',
      directory: new URL('../test-migrations/broken/', import.meta.url),
    };

    const failure = await migrateToLatest(database, [
      inventoryMigrations,
      catalogueMigrations,
      brokenMigrations,
    ]).catch((error: unknown) => error);

    expect(failure).toHaveProperty(
      'message',
      'database migration failed at broken/0001-read-missing-table',
    );
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

  it('refuses two sources with the same name', async () => {
    const failure = await migrateToLatest(database, [
      inventoryMigrations,
      { ...catalogueMigrations, name: 'inventory' },
    ]).catch((error: unknown) => error);

    expect(failure).toHaveProperty('message', 'duplicate migration source names: inventory');
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

  it('keeps serving queries after the server terminates its idle connections', async () => {
    await sql`select 1`.execute(database);

    await terminateOtherConnections();
    const result = await sql<{ readonly answer: number }>`select 42 as answer`.execute(database);

    expect(result.rows).toEqual([{ answer: 42 }]);
    expect(connectionErrors.some((error) => Reflect.get(error, 'code') === '57P01')).toBe(true);
  });
});

describe('runInTransaction', () => {
  it('reports a connection lost mid-transaction as a transient failure and frees the connection', async () => {
    for (let attempt = 0; attempt <= maximumConnectionCount; attempt += 1) {
      const failure = await runInTransaction(database, async (transaction) => {
        await sql`select 1`.execute(transaction);
        await terminateOtherConnections();
        await sql`select 1`.execute(transaction);
      }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(DatabaseConnectionLostError);
      expect(failure).toHaveProperty('code', '08006');
    }

    const result = await runInTransaction(database, (transaction) =>
      sql<{ readonly answer: number }>`select 7 as answer`.execute(transaction),
    );

    expect(result.rows).toEqual([{ answer: 7 }]);
  });
});

describe('ConcurrencyConflictError', () => {
  it('carries the serialization failure SQLSTATE so consumers retry it as transient', () => {
    expect(new ConcurrencyConflictError('order-1 changed')).toMatchObject({
      name: 'ConcurrencyConflictError',
      code: '40001',
      message: 'order-1 changed',
    });
  });

  it('turns a unique violation into a conflict that keeps the driver error as its cause', async () => {
    const stockItem = { stockItemId: 'duplicate-sku', quantityOnHand: 1n, reorderLevel: 0n };
    await database.insertInto('stockItems').values(stockItem).execute();

    const failure = await database
      .insertInto('stockItems')
      .values(stockItem)
      .execute()
      .catch((error: unknown) =>
        ConcurrencyConflictError.fromUniqueViolation(error, 'stock item duplicate-sku exists'),
      );

    expect(failure).toBeInstanceOf(ConcurrencyConflictError);
    expect(failure).toMatchObject({
      code: '40001',
      message: 'stock item duplicate-sku exists',
      cause: { code: '23505' },
    });
  });

  it('keeps any other failure as it was', () => {
    const failure = Object.assign(new Error('deadlock detected'), { code: '40P01' });

    expect(ConcurrencyConflictError.fromUniqueViolation(failure, 'ignored')).toBe(failure);
  });
});
