import { left, right, type Either } from '@fd/domain';
import { parseMenuItemId, type MenuItemId } from './menu-item-id.value-object.ts';
import {
  parseOpeningHours,
  type InvalidOpeningHours,
  type OpeningHours,
  type RawOpeningHours,
} from './opening-hours.value-object.ts';
import { parseRestaurantId, type RestaurantId } from './restaurant-id.value-object.ts';

export interface MenuItem {
  readonly menuItemId: MenuItemId;
  readonly name: string;
  readonly priceInCents: bigint;
  readonly isAvailable: boolean;
}

export interface RestaurantMenu {
  readonly restaurantId: RestaurantId;
  readonly version: number;
  readonly openingHours: OpeningHours;
  readonly minimumOrderInCents: bigint;
  readonly items: readonly MenuItem[];
}

export interface RawMenuItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly priceInCents: bigint;
  readonly isAvailable: boolean;
}

export interface RawRestaurantMenu {
  readonly restaurantId: string;
  readonly version: number;
  readonly openingHours: RawOpeningHours;
  readonly minimumOrderInCents: bigint;
  readonly items: readonly RawMenuItem[];
}

export interface InvalidRestaurantMenu {
  readonly type: 'InvalidRestaurantMenu';
  readonly field: 'restaurantId' | 'version' | 'minimumOrderInCents' | keyof RawMenuItem;
}

export type RestaurantMenuError = InvalidRestaurantMenu | InvalidOpeningHours;

const controlCharacter = /\p{Cc}/u;

function invalid(field: InvalidRestaurantMenu['field']): Either<InvalidRestaurantMenu, never> {
  return left({ type: 'InvalidRestaurantMenu', field });
}

function parseMenuItem(rawItem: RawMenuItem): Either<InvalidRestaurantMenu, MenuItem> {
  const menuItemId = parseMenuItemId(rawItem.menuItemId);
  if (menuItemId.isLeft()) return invalid('menuItemId');
  if (rawItem.name.trim().length === 0 || controlCharacter.test(rawItem.name)) {
    return invalid('name');
  }
  if (rawItem.priceInCents <= 0n) return invalid('priceInCents');
  return right({ ...rawItem, menuItemId: menuItemId.success });
}

function parseMenuItems(
  rawItems: readonly RawMenuItem[],
): Either<InvalidRestaurantMenu, readonly MenuItem[]> {
  const items: MenuItem[] = [];
  for (const rawItem of rawItems) {
    const item = parseMenuItem(rawItem);
    if (item.isLeft()) return item;
    items.push(item.success);
  }
  return right(items);
}

export function parseRestaurantMenu(
  rawMenu: RawRestaurantMenu,
): Either<RestaurantMenuError, RestaurantMenu> {
  const restaurantId = parseRestaurantId(rawMenu.restaurantId);
  if (restaurantId.isLeft()) return invalid('restaurantId');
  if (!Number.isSafeInteger(rawMenu.version) || rawMenu.version < 1) return invalid('version');
  if (rawMenu.minimumOrderInCents < 0n) return invalid('minimumOrderInCents');
  const openingHours = parseOpeningHours(rawMenu.openingHours);
  if (openingHours.isLeft()) return openingHours;
  const items = parseMenuItems(rawMenu.items);
  if (items.isLeft()) return items;
  return right({
    restaurantId: restaurantId.success,
    version: rawMenu.version,
    openingHours: openingHours.success,
    minimumOrderInCents: rawMenu.minimumOrderInCents,
    items: items.success,
  });
}
