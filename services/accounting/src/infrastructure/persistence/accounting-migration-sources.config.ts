import { inboxMigrations } from '@fd/chassis-inbox';
import { outboxMigrations } from '@fd/chassis-outbox';
import type { MigrationSource } from '@fd/chassis-postgres';

export const accountingMigrationSources: readonly MigrationSource[] = [
  outboxMigrations,
  inboxMigrations,
  { name: 'accounting', directory: new URL('./migrations/', import.meta.url) },
];
