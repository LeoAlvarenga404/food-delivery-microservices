import { z } from 'zod';
import type {
  MenuItem,
  Refusal,
  RestaurantView,
} from '../restaurant-api/restaurant-api.adapter.ts';
import {
  amountTextPattern,
  toAmountInCents,
  toAmountText,
} from '../restaurant-api/restaurant-api-view.message-mapper.ts';

const menuRowSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  price: z.string().trim().regex(amountTextPattern, 'Write a price such as 39.90.'),
  isAvailable: z.boolean(),
});

export const menuFormSchema = z
  .object({ menuRows: z.array(menuRowSchema) })
  .transform(({ menuRows }): readonly MenuItem[] =>
    menuRows.map(({ menuItemId, name, price, isAvailable }) => ({
      menuItemId,
      name,
      priceInCents: toAmountInCents(price),
      isAvailable,
    })),
  );

export type MenuFormValues = z.input<typeof menuFormSchema>;

export type MenuRow = MenuFormValues['menuRows'][number];

export function toMenuForm(restaurant: RestaurantView): MenuFormValues {
  return {
    menuRows: restaurant.menuItems.map(({ menuItemId, name, priceInCents, isAvailable }) => ({
      menuItemId,
      name,
      price: toAmountText(priceInCents),
      isAvailable,
    })),
  };
}

export function newMenuRow(menuItemId: string): MenuRow {
  return { menuItemId, name: '', price: '', isAvailable: true };
}

export function describeRevision(
  revised: { readonly version: number } | Refusal | undefined,
): string {
  if (revised === undefined) return '';
  return 'problem' in revised
    ? revised.problem
    : `Menu saved as version ${String(revised.version)}.`;
}
