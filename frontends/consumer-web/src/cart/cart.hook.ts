import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { OrderPlacement } from '../consumer-api/consumer-api.adapter.ts';

const cartSchema = z.object({
  restaurantId: z.uuid(),
  restaurantName: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  lines: z.array(
    z.object({
      menuItemId: z.uuid(),
      name: z.string(),
      priceInCents: z.string().regex(/^\d+$/),
      quantity: z.int().min(1),
    }),
  ),
  checkoutKey: z.uuid(),
});

export type Cart = z.infer<typeof cartSchema>;

export interface CartAddition {
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly currency: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly priceInCents: string;
}

export type Delivery = Pick<OrderPlacement, 'deliveryAddress' | 'paymentToken'>;

export interface CartState {
  readonly cart: Cart | undefined;
  readonly saveCart: (cart: Cart | undefined) => void;
}

const cartStorageKey = 'consumer-web-cart';
const cartListeners = new Set<() => void>();

function addLine(lines: Cart['lines'], addition: CartAddition): Cart['lines'] {
  const isInCart = lines.some((line) => line.menuItemId === addition.menuItemId);
  if (!isInCart) {
    const { menuItemId, name, priceInCents } = addition;
    return [...lines, { menuItemId, name, priceInCents, quantity: 1 }];
  }
  return lines.map((line) =>
    line.menuItemId === addition.menuItemId ? { ...line, quantity: line.quantity + 1 } : line,
  );
}

export function addToCart(
  cart: Cart | undefined,
  addition: CartAddition,
  checkoutKey: string,
): Cart {
  const lines = cart?.restaurantId === addition.restaurantId ? cart.lines : [];
  const { restaurantId, restaurantName, currency } = addition;
  return { restaurantId, restaurantName, currency, lines: addLine(lines, addition), checkoutKey };
}

export function cartTotalInCents(cart: Cart): string {
  const totalInCents = cart.lines.reduce(
    (total, line) => total + BigInt(line.priceInCents) * BigInt(line.quantity),
    0n,
  );
  return totalInCents.toString();
}

export function toOrderPlacement(cart: Cart, delivery: Delivery): OrderPlacement {
  return {
    restaurantId: cart.restaurantId,
    lineItems: cart.lines.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })),
    ...delivery,
    idempotencyKey: cart.checkoutKey,
  };
}

export function parseStoredCart(stored: string | null): Cart | undefined {
  if (stored === null) return undefined;
  try {
    const parsed = cartSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function subscribeToCart(listener: () => void): () => void {
  cartListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    cartListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function saveCart(cart: Cart | undefined): void {
  if (cart === undefined) localStorage.removeItem(cartStorageKey);
  else localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  cartListeners.forEach((listener) => {
    listener();
  });
}

export function useCart(): CartState {
  const stored = useSyncExternalStore(
    subscribeToCart,
    () => localStorage.getItem(cartStorageKey),
    () => null,
  );
  return { cart: parseStoredCart(stored), saveCart };
}
