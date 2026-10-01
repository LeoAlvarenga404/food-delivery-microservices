import type { MigrationSource } from '@fd/chassis-postgres';

export const outboxMigrations: MigrationSource = {
  name: 'outbox',
  directory: new URL('../migrations/', import.meta.url),
};
