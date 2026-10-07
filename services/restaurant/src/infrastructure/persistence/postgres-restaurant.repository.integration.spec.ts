import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startRestaurantTestDatabase,
  type RestaurantTestDatabase,
} from '../../../test/support/restaurant-database.builder.ts';
import { describeRestaurantRepositoryContract } from '../../../test/support/restaurant-repository.contract.ts';
import {
  buildRestaurant,
  margherita,
  menuOf,
  pizzeriaId,
  staffAId,
} from '../../../test/support/restaurant.builder.ts';
import type { Restaurant } from '#domain/restaurant/restaurant.aggregate.ts';
import { PostgresRestaurantRepository } from './postgres-restaurant.repository.ts';

const revisionCount = 40;
const revisedAt = new Date('2026-10-04T12:30:00.000Z');

let testDatabase: RestaurantTestDatabase;

beforeAll(async () => {
  testDatabase = await startRestaurantTestDatabase();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeRestaurantRepositoryContract('postgres', async (storedRestaurants) => {
  await testDatabase.replaceRestaurants(storedRestaurants);
  return new PostgresRestaurantRepository(testDatabase.database);
});

function menuItemNameOf(version: number): string {
  return `Margherita ${String(version)}`;
}

function disagreesWithItsVersion(restaurant: Restaurant | undefined): boolean {
  const snapshot = restaurant?.toSnapshot();
  const [menuItem] = snapshot?.menuItems ?? [];
  if (snapshot === undefined || snapshot.version === 1) return false;
  return menuItem?.name !== menuItemNameOf(snapshot.version);
}

async function reviseInTransactions(): Promise<void> {
  for (let version = 1; version <= revisionCount; version += 1) {
    await testDatabase.database.transaction().execute(async (transaction) => {
      const restaurants = new PostgresRestaurantRepository(transaction);
      const restaurant = await restaurants.findById(pizzeriaId);
      const menu = menuOf([{ ...margherita, name: menuItemNameOf(version + 1) }]);
      restaurant?.reviseMenu(staffAId, menu, revisedAt);
      if (restaurant !== undefined) await restaurants.save(restaurant);
    });
  }
}

describe('postgres restaurant repository during revisions', () => {
  it('reads each restaurant with the menu of the version it reports', async () => {
    await testDatabase.replaceRestaurants([buildRestaurant({ version: 1 })]);
    const restaurants = new PostgresRestaurantRepository(testDatabase.database);
    const revisionProgress = { isDone: false };
    const revisions = reviseInTransactions().finally(() => {
      revisionProgress.isDone = true;
    });
    const disagreeingReads: (Restaurant | undefined)[] = [];

    while (!revisionProgress.isDone) {
      const [byId, byMember, every] = await Promise.all([
        restaurants.findById(pizzeriaId),
        restaurants.findByMember(staffAId),
        restaurants.findAll(),
      ]);
      disagreeingReads.push(...[byId, ...byMember, ...every].filter(disagreesWithItsVersion));
    }
    await revisions;

    expect(disagreeingReads).toEqual([]);
  });
});
