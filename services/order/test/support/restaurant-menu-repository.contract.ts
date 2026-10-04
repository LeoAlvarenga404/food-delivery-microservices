import { describe, expect, it } from 'vitest';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import {
  parseRestaurantMenu,
  type RestaurantMenu,
} from '#domain/menu/restaurant-menu.value-object.ts';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import { unwrap } from './order.builder.ts';

function trattoriaMenu(restaurantId: string, version: number): RestaurantMenu {
  return unwrap(
    parseRestaurantMenu({
      restaurantId,
      version,
      openingHours: {
        timeZone: 'Europe/Lisbon',
        periods: [
          { dayOfWeek: 'TUESDAY', opensAt: '11:30', closesAt: '15:00' },
          { dayOfWeek: 'SATURDAY', opensAt: '19:00', closesAt: '01:00' },
        ],
      },
      minimumOrderInCents: 3500n,
      items: [
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000e02',
          name: 'Lasagna',
          priceInCents: 6100n,
          isAvailable: false,
        },
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000e01',
          name: 'Tiramisu',
          priceInCents: 2900n,
          isAvailable: true,
        },
      ],
    }),
  );
}

function revisedTrattoriaMenu(restaurantId: string, version: number): RestaurantMenu {
  return unwrap(
    parseRestaurantMenu({
      restaurantId,
      version,
      openingHours: {
        timeZone: 'America/Sao_Paulo',
        periods: [{ dayOfWeek: 'SUNDAY', opensAt: '12:00', closesAt: '16:00' }],
      },
      minimumOrderInCents: 0n,
      items: [
        {
          menuItemId: '0199a5d0-0000-7000-8000-000000000e01',
          name: 'Tiramisu della casa',
          priceInCents: 3100n,
          isAvailable: false,
        },
      ],
    }),
  );
}

export function describeRestaurantMenuRepositoryContract(
  implementationName: string,
  createRepository: () => RestaurantMenuRepository,
): void {
  describe(`${implementationName} restaurant menu repository`, () => {
    it('saves the first snapshot of a restaurant and finds it whole', async () => {
      const menus = createRepository();
      const menu = trattoriaMenu('0199a5d0-0000-7000-8000-0000000001a1', 3);

      const wasSaved = await menus.saveIfNewer(menu);

      expect(wasSaved).toBe(true);
      expect(await menus.findByRestaurantId(menu.restaurantId)).toEqual(menu);
    });

    it('returns undefined for a restaurant without a menu replica', async () => {
      const unknownRestaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000ff'));

      expect(await createRepository().findByRestaurantId(unknownRestaurantId)).toBeUndefined();
    });

    it('replaces the replica with a newer snapshot', async () => {
      const menus = createRepository();
      const restaurantId = '0199a5d0-0000-7000-8000-0000000001a2';
      await menus.saveIfNewer(trattoriaMenu(restaurantId, 1));
      const revised = revisedTrattoriaMenu(restaurantId, 2);

      const wasSaved = await menus.saveIfNewer(revised);

      expect(wasSaved).toBe(true);
      expect(await menus.findByRestaurantId(revised.restaurantId)).toEqual(revised);
    });

    it('ignores a snapshot with the version the replica already has', async () => {
      const menus = createRepository();
      const stored = trattoriaMenu('0199a5d0-0000-7000-8000-0000000001a3', 2);
      await menus.saveIfNewer(stored);

      const wasSaved = await menus.saveIfNewer(revisedTrattoriaMenu(stored.restaurantId, 2));

      expect(wasSaved).toBe(false);
      expect(await menus.findByRestaurantId(stored.restaurantId)).toEqual(stored);
    });

    it('ignores a snapshot older than the replica', async () => {
      const menus = createRepository();
      const stored = trattoriaMenu('0199a5d0-0000-7000-8000-0000000001a4', 5);
      await menus.saveIfNewer(stored);

      const wasSaved = await menus.saveIfNewer(revisedTrattoriaMenu(stored.restaurantId, 4));

      expect(wasSaved).toBe(false);
      expect(await menus.findByRestaurantId(stored.restaurantId)).toEqual(stored);
    });
  });
}
