import type { Kysely, Transaction } from 'kysely';
import { DatabaseConnectionLostError } from './database-connection-lost-error.ts';

export async function runInTransaction<Schema, Result>(
  database: Kysely<Schema>,
  work: (transaction: Transaction<Schema>) => Promise<Result>,
): Promise<Result> {
  try {
    return await database.transaction().execute(work);
  } catch (error) {
    throw DatabaseConnectionLostError.fromDriverError(error);
  }
}
