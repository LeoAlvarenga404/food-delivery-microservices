import { readdir, readFile } from 'node:fs/promises';
import { sql, type Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';

export interface MigrationSource {
  readonly name: string;
  readonly directory: URL;
}

const sqlFileExtension = '.sql';

async function readSourceMigrations(source: MigrationSource): Promise<[string, Migration][]> {
  const fileNames = (await readdir(source.directory))
    .filter((fileName) => fileName.endsWith(sqlFileExtension))
    .sort();
  return Promise.all(
    fileNames.map(async (fileName): Promise<[string, Migration]> => {
      const statements = await readFile(new URL(fileName, source.directory), 'utf8');
      const migrationName = `${source.name}/${fileName.slice(0, -sqlFileExtension.length)}`;
      const migration: Migration = {
        up: async (database) => {
          await sql.raw(statements).execute(database);
        },
      };
      return [migrationName, migration];
    }),
  );
}

function sqlFileMigrationProvider(sources: readonly MigrationSource[]): MigrationProvider {
  return {
    getMigrations: async () => {
      const migrationsBySource = await Promise.all(sources.map(readSourceMigrations));
      return Object.fromEntries(migrationsBySource.flat());
    },
  };
}

export async function migrateToLatest<Schema>(
  database: Kysely<Schema>,
  sources: readonly MigrationSource[],
): Promise<readonly string[]> {
  const migrator = new Migrator({
    db: database,
    provider: sqlFileMigrationProvider(sources),
    allowUnorderedMigrations: true,
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error !== undefined) throw new Error('database migration failed', { cause: error });
  return (results ?? []).map((result) => result.migrationName);
}
