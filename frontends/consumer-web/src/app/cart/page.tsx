import type { ReactNode } from 'react';
import { CartView } from '../../cart/cart.component.tsx';

export default function CartPage(): ReactNode {
  return (
    <main>
      <h1>Your cart</h1>
      <CartView />
    </main>
  );
}
