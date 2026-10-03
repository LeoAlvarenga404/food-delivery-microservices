import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

export interface DatabaseSettings {
  readonly connectionString: string;
  readonly maximumConnectionCount: number;
  readonly onConnectionError: (error: Error) => void;
}

pg.types.setTypeParser(pg.types.builtins.INT8, (text) => BigInt(text));

export function createDatabase<Schema>(settings: DatabaseSettings): Kysely<Schema> {
  const pool = new pg.Pool({
    connectionString: settings.connectionString,
    max: settings.maximumConnectionCount,
  });
  pool.on('error', settings.onConnectionError);
  pool.on('connect', (client) => {
    client.on('error', settings.onConnectionError);
  });
  return new Kysely<Schema>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}
