import type { ReactNode } from 'react';
import { CartView } from '../../cart/cart.component.tsx';
import { readSession } from '../../session/session-cookie.adapter.ts';

export default async function CartPage(): Promise<ReactNode> {
  const session = await readSession();
  return (
    <main>
      <h1>Your cart</h1>
      <CartView isSignedIn={session !== undefined} />
    </main>
  );
}
