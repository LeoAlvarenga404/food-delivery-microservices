'use client';

import type { ReactNode } from 'react';
import { formatAmount } from '../consumer-api/consumer-api-view.message-mapper.ts';
import { cartTotalInCents, useCart, type Cart } from './cart.hook.ts';

function CartLines({ cart }: { readonly cart: Cart }): ReactNode {
  return (
    <>
      <h2>{cart.restaurantName}</h2>
      <ul>
        {cart.lines.map((line) => (
          <li key={line.menuItemId}>
            {line.quantity} x {line.name} {formatAmount(line.priceInCents, cart.currency)}
          </li>
        ))}
      </ul>
      <p>Total {formatAmount(cartTotalInCents(cart), cart.currency)}</p>
    </>
  );
}

export function CartView(): ReactNode {
  const { cart, saveCart } = useCart();
  if (cart === undefined) return <p>Your cart is empty.</p>;
  return (
    <section aria-label="Cart">
      <CartLines cart={cart} />
      <button
        type="button"
        onClick={() => {
          saveCart(undefined);
        }}
      >
        Empty the cart
      </button>
    </section>
  );
}
