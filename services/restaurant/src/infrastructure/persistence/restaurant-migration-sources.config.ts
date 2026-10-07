import { outboxMigrations } from '@fd/chassis-outbox';
import type { MigrationSource } from '@fd/chassis-postgres';

export const restaurantMigrationSources: readonly MigrationSource[] = [
  outboxMigrations,
  { name: 'restaurant', directory: new URL('./migrations/', import.meta.url) },
];
