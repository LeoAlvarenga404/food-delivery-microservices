import type { MigrationSource } from '@fd/chassis-postgres';

export const inboxMigrations: MigrationSource = {
  name: 'inbox',
  directory: new URL('../migrations/', import.meta.url),
};
