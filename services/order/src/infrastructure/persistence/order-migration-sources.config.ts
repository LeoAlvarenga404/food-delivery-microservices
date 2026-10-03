import { inboxMigrations } from '@fd/chassis-inbox';
import { outboxMigrations } from '@fd/chassis-outbox';
import type { MigrationSource } from '@fd/chassis-postgres';

export const orderMigrationSources: readonly MigrationSource[] = [
  outboxMigrations,
  inboxMigrations,
  { name: 'order', directory: new URL('./migrations/', import.meta.url) },
];
