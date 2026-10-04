import { left, right, type Either } from '@fd/domain';
import { parseMenuItemId, type MenuItemId } from './menu-item-id.value-object.ts';

export interface MenuItem {
  readonly menuItemId: MenuItemId;
  readonly name: string;
  readonly priceInCents: bigint;
  readonly isAvailable: boolean;
}

export interface RawMenuItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly priceInCents: bigint;
  readonly isAvailable: boolean;
}

export interface InvalidMenuItem {
  readonly type: 'InvalidMenuItem';
  readonly field: 'menuItemId' | 'name' | 'priceInCents';
}

const maximumNameLength = 100;
const maximumPriceInCents = 10_000_000n;
const controlCharacterPattern = /\p{Cc}/u;

function isValidName(name: string): boolean {
  return name.length > 0 && name.length <= maximumNameLength && !controlCharacterPattern.test(name);
}

export function parseMenuItem(rawMenuItem: RawMenuItem): Either<InvalidMenuItem, MenuItem> {
  const menuItemId = parseMenuItemId(rawMenuItem.menuItemId);
  if (menuItemId.isLeft()) return left({ type: 'InvalidMenuItem', field: 'menuItemId' });
  const name = rawMenuItem.name.trim();
  if (!isValidName(name)) return left({ type: 'InvalidMenuItem', field: 'name' });
  const { priceInCents } = rawMenuItem;
  if (priceInCents <= 0n || priceInCents > maximumPriceInCents) {
    return left({ type: 'InvalidMenuItem', field: 'priceInCents' });
  }
  return right({
    menuItemId: menuItemId.success,
    name,
    priceInCents,
    isAvailable: rawMenuItem.isAvailable,
  });
}
