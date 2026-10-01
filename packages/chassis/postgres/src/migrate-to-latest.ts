import { readdir, readFile } from 'node:fs/promises';
import { sql, type Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';

export interface MigrationSource {
  readonly name: string;
  readonly directory: URL;
}

const sqlFileExtension = '.sql';

function directoryUrl(directory: URL): URL {
  return directory.href.endsWith('/') ? directory : new URL(`${directory.href}/`);
}

async function readSourceMigrations(source: MigrationSource): Promise<[string, Migration][]> {
  const directory = directoryUrl(source.directory);
  const fileNames = (await readdir(directory)).filter((fileName) =>
    fileName.endsWith(sqlFileExtension),
  );
  return Promise.all(
    fileNames.map(async (fileName): Promise<[string, Migration]> => {
      const statements = await readFile(new URL(fileName, directory), 'utf8');
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

function assertUniqueSourceNames(sources: readonly MigrationSource[]): void {
  const names = sources.map((source) => source.name);
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    throw new Error(`duplicate migration source names: ${duplicateNames.join(', ')}`);
  }
}

export async function migrateToLatest<Schema>(
  database: Kysely<Schema>,
  sources: readonly MigrationSource[],
): Promise<readonly string[]> {
  assertUniqueSourceNames(sources);
  const migrator = new Migrator({
    db: database,
    provider: sqlFileMigrationProvider(sources),
    allowUnorderedMigrations: true,
  });
  const { error, results = [] } = await migrator.migrateToLatest();
  if (error !== undefined) {
    const failedMigration = results.find((result) => result.status === 'Error');
    const location = failedMigration === undefined ? '' : ` at ${failedMigration.migrationName}`;
    throw new Error(`database migration failed${location}`, { cause: error });
  }
  return results.map((result) => result.migrationName);
}
