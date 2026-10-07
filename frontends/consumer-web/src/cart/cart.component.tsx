'use client';

import type { ReactNode } from 'react';
import { formatAmount } from '../consumer-api/consumer-api-view.message-mapper.ts';
import { CheckoutForm } from '../orders/checkout-form.component.tsx';
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

export function CartView({ isSignedIn }: { readonly isSignedIn: boolean }): ReactNode {
  const { cart, saveCart } = useCart();
  if (cart === undefined) return <p>Your cart is empty.</p>;
  const emptyCart = (): void => {
    saveCart(undefined);
  };
  return (
    <section aria-label="Cart">
      <CartLines cart={cart} />
      <button type="button" onClick={emptyCart}>
        Empty the cart
      </button>
      {isSignedIn ? (
        <CheckoutForm cart={cart} onPlaced={emptyCart} />
      ) : (
        <p>
          <a href="/auth/login?returnTo=%2Fcart">Sign in to order</a>
        </p>
      )}
    </section>
  );
}
