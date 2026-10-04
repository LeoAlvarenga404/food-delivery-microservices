import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRestaurantMenuRepository } from '../../../../test/support/in-memory-restaurant-menu.repository.ts';
import { margheritaId, pizzeriaMenu, unwrap } from '../../../../test/support/order.builder.ts';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { ApplyMenuRevisionCommandHandler } from './apply-menu-revision.command-handler.ts';

const repricedMenu: RestaurantMenu = {
  ...pizzeriaMenu,
  version: 3,
  minimumOrderInCents: 2500n,
  items: [{ menuItemId: margheritaId, name: 'Margherita', priceInCents: 5000n, isAvailable: true }],
};

let menus: InMemoryRestaurantMenuRepository;
let applyMenuRevision: ApplyMenuRevisionCommandHandler;

beforeEach(() => {
  menus = new InMemoryRestaurantMenuRepository();
  applyMenuRevision = new ApplyMenuRevisionCommandHandler(menus);
});

describe('ApplyMenuRevisionCommandHandler', () => {
  it('replaces the replica with a snapshot newer than it', async () => {
    const outcome = await applyMenuRevision.execute({ menu: repricedMenu });

    expect(outcome).toEqual(right(undefined));
    expect(await menus.findByRestaurantId(pizzeriaMenu.restaurantId)).toEqual(repricedMenu);
  });

  it('starts the replica of a restaurant with its first snapshot', async () => {
    const trattoriaMenu = {
      ...repricedMenu,
      restaurantId: unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000001a1')),
      version: 1,
    };

    expect(await applyMenuRevision.execute({ menu: trattoriaMenu })).toEqual(right(undefined));
    expect(await menus.findByRestaurantId(trattoriaMenu.restaurantId)).toEqual(trattoriaMenu);
  });

  it.each([
    { snapshot: 'the version the replica already has', version: 2 },
    { snapshot: 'an older version', version: 1 },
  ])('ignores a snapshot with $snapshot and keeps the replica', async ({ version }) => {
    const outcome = await applyMenuRevision.execute({ menu: { ...repricedMenu, version } });

    expect(outcome).toEqual(
      left({ type: 'StaleMenuRevision', restaurantId: pizzeriaMenu.restaurantId, version }),
    );
    expect(await menus.findByRestaurantId(pizzeriaMenu.restaurantId)).toEqual(pizzeriaMenu);
  });
});
