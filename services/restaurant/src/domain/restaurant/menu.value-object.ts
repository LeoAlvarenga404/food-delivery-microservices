import { left, right, type Brand, type Either } from '@fd/domain';
import type { MenuItemId } from './menu-item-id.value-object.ts';
import {
  parseMenuItem,
  type InvalidMenuItem,
  type MenuItem,
  type RawMenuItem,
} from './menu-item.value-object.ts';

export type Menu = Brand<readonly MenuItem[], 'Menu'>;

export interface InvalidMenuItemCount {
  readonly type: 'InvalidMenuItemCount';
  readonly menuItemCount: number;
}

export interface DuplicateMenuItem {
  readonly type: 'DuplicateMenuItem';
  readonly menuItemId: MenuItemId;
}

export type InvalidMenu = InvalidMenuItem | InvalidMenuItemCount | DuplicateMenuItem;

const maximumMenuItemCount = 200;

export const emptyMenu = [] as unknown as Menu;

export function parseMenu(rawMenuItems: readonly RawMenuItem[]): Either<InvalidMenu, Menu> {
  if (rawMenuItems.length > maximumMenuItemCount) {
    return left({ type: 'InvalidMenuItemCount', menuItemCount: rawMenuItems.length });
  }
  const menuItems: MenuItem[] = [];
  for (const rawMenuItem of rawMenuItems) {
    const menuItem = parseMenuItem(rawMenuItem);
    if (menuItem.isLeft()) return menuItem;
    const { menuItemId } = menuItem.success;
    if (menuItems.some((parsed) => parsed.menuItemId === menuItemId)) {
      return left({ type: 'DuplicateMenuItem', menuItemId });
    }
    menuItems.push(menuItem.success);
  }
  return right(menuItems as readonly MenuItem[] as Menu);
}
