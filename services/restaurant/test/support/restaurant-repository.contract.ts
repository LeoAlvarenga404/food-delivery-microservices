import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type { Restaurant } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import { parseStaffMemberId } from '#domain/restaurant/staff-member-id.value-object.ts';
import {
  buildRestaurant,
  guarana,
  margherita,
  menuOf,
  onboardRestaurant,
  pizzeriaId,
  staffAId,
  staffBId,
  unwrap,
} from './restaurant.builder.ts';

const burgerJointId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000b2'));
const sushiBarId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000b3'));
const revisedAt = new Date('2026-10-04T12:30:00.000Z');

async function findStoredPizzeria(restaurants: RestaurantRepository): Promise<Restaurant> {
  const restaurant = await restaurants.findById(pizzeriaId);
  if (restaurant === undefined) throw new Error('the pizzeria was not stored');
  return restaurant;
}

export function describeRestaurantRepositoryContract(
  implementationName: string,
  createRepository: (storedRestaurants: readonly Restaurant[]) => Promise<RestaurantRepository>,
): void {
  describe(`${implementationName} restaurant repository`, () => {
    const sushiBar = buildRestaurant({
      restaurantId: sushiBarId,
      members: [
        { staffMemberId: staffAId, role: 'OWNER' },
        { staffMemberId: staffBId, role: 'OWNER' },
      ],
      version: 4,
    });
    let restaurants: RestaurantRepository;

    beforeEach(async () => {
      restaurants = await createRepository([sushiBar]);
    });

    it('finds a stored restaurant with its profile, menu in order, members and version', async () => {
      const found = await restaurants.findById(sushiBarId);

      expect(found?.toSnapshot()).toEqual(sushiBar.toSnapshot());
    });

    it('returns undefined for a restaurant that was never stored', async () => {
      expect(await restaurants.findById(burgerJointId)).toBeUndefined();
    });

    it('saves an onboarded restaurant with its owner and an empty menu at version one', async () => {
      const onboarded = onboardRestaurant();

      await restaurants.save(onboarded);

      expect((await findStoredPizzeria(restaurants)).toSnapshot()).toEqual({
        ...onboarded.toSnapshot(),
        version: 1,
      });
    });

    it('saves a revised menu in its order with the next version, leaving the others', async () => {
      await restaurants.save(onboardRestaurant());
      const stored = await findStoredPizzeria(restaurants);
      unwrap(stored.reviseMenu(staffAId, menuOf([guarana, margherita]), revisedAt));

      await restaurants.save(stored);

      expect((await findStoredPizzeria(restaurants)).toSnapshot()).toEqual({
        ...stored.toSnapshot(),
        menuItems: [guarana, margherita],
        version: 2,
      });
      expect((await restaurants.findById(sushiBarId))?.toSnapshot().version).toBe(4);
    });

    it('replaces the menu items instead of adding to them', async () => {
      await restaurants.save(onboardRestaurant());
      const firstRevision = await findStoredPizzeria(restaurants);
      unwrap(firstRevision.reviseMenu(staffAId, menuOf([margherita, guarana]), revisedAt));
      await restaurants.save(firstRevision);
      const secondRevision = await findStoredPizzeria(restaurants);
      unwrap(secondRevision.reviseMenu(staffAId, menuOf([guarana]), revisedAt));

      await restaurants.save(secondRevision);

      expect((await findStoredPizzeria(restaurants)).toSnapshot().menuItems).toEqual([guarana]);
    });

    it('rejects a save based on a version another save already replaced', async () => {
      await restaurants.save(onboardRestaurant());
      const stored = await findStoredPizzeria(restaurants);
      await restaurants.save(stored);

      await expect(restaurants.save(stored)).rejects.toThrow(ConcurrencyConflictError);
    });

    it('refuses a new restaurant whose id is already stored as a concurrency conflict', async () => {
      await restaurants.save(onboardRestaurant());

      await expect(restaurants.save(onboardRestaurant())).rejects.toThrow(ConcurrencyConflictError);
    });

    it('finds every restaurant in id order, each with its own menu and version', async () => {
      await restaurants.save(onboardRestaurant({ restaurantId: burgerJointId, owner: staffBId }));
      await restaurants.save(onboardRestaurant());

      const everyRestaurant = await restaurants.findAll();

      expect(everyRestaurant.map((restaurant) => restaurant.toSnapshot())).toEqual([
        { ...onboardRestaurant().toSnapshot(), version: 1 },
        {
          ...onboardRestaurant({ restaurantId: burgerJointId, owner: staffBId }).toSnapshot(),
          version: 1,
        },
        sushiBar.toSnapshot(),
      ]);
    });

    it('finds the restaurants of a member in id order and none for a stranger', async () => {
      await restaurants.save(onboardRestaurant());
      await restaurants.save(onboardRestaurant({ restaurantId: burgerJointId, owner: staffBId }));

      const ofStaffA = await restaurants.findByMember(staffAId);
      const ofStaffB = await restaurants.findByMember(staffBId);
      const ofStranger = await restaurants.findByMember(
        unwrap(parseStaffMemberId('0199a5d0-0000-7000-8000-0000000000ef')),
      );

      expect(ofStaffA.map((restaurant) => restaurant.toSnapshot().restaurantId)).toEqual([
        pizzeriaId,
        sushiBarId,
      ]);
      expect(ofStaffB.map((restaurant) => restaurant.toSnapshot().restaurantId)).toEqual([
        burgerJointId,
        sushiBarId,
      ]);
      expect(ofStranger).toEqual([]);
    });
  });
}
