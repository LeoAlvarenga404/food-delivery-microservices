'use client';

import type { ReactNode } from 'react';
import { addToCart, useCart, type CartAddition } from './cart.hook.ts';

export function AddToCartButton({ addition }: { readonly addition: CartAddition }): ReactNode {
  const { cart, saveCart } = useCart();
  const quantity = cart?.lines.find((line) => line.menuItemId === addition.menuItemId)?.quantity;
  return (
    <button
      type="button"
      aria-label={`Add ${addition.name} to the cart`}
      onClick={() => {
        saveCart(addToCart(cart, addition, crypto.randomUUID()));
      }}
    >
      Add{quantity === undefined ? '' : ` (${String(quantity)} in the cart)`}
    </button>
  );
}
