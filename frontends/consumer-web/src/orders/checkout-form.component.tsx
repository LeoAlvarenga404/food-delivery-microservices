'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { toOrderPlacement, type Cart, type Delivery } from '../cart/cart.hook.ts';
import { placeOrder } from './place-order.action.ts';

interface CheckoutFormProperties {
  readonly cart: Cart;
  readonly onPlaced: () => void;
}

interface Placement {
  readonly problem: string | undefined;
  readonly isPlacing: boolean;
  readonly submit: (form: FormData) => void;
}

const addressFields: readonly (readonly [string, string])[] = [
  ['street', 'Street'],
  ['number', 'Number'],
  ['city', 'City'],
  ['postalCode', 'Postal code'],
];

function readField(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry : '';
}

function toDelivery(form: FormData): Delivery {
  return {
    deliveryAddress: {
      street: readField(form, 'street'),
      number: readField(form, 'number'),
      city: readField(form, 'city'),
      postalCode: readField(form, 'postalCode'),
    },
    paymentToken: readField(form, 'paymentToken'),
  };
}

function usePlacement({ cart, onPlaced }: CheckoutFormProperties): Placement {
  const [problem, setProblem] = useState<string>();
  const [isPlacing, startPlacing] = useTransition();
  const submit = (form: FormData): void => {
    startPlacing(async () => {
      const result = await placeOrder(toOrderPlacement(cart, toDelivery(form)));
      if ('problem' in result) {
        setProblem(result.problem);
        return;
      }
      if ('orderId' in result) onPlaced();
      window.location.assign(
        'orderId' in result ? `/orders/${result.orderId}` : '/auth/login?returnTo=%2Fcart',
      );
    });
  };
  return { problem, isPlacing, submit };
}

export function CheckoutForm(properties: CheckoutFormProperties): ReactNode {
  const { problem, isPlacing, submit } = usePlacement(properties);
  return (
    <form action={submit} aria-label="Checkout">
      {addressFields.map(([name, label]) => (
        <p key={name}>
          <label>
            {label} <input name={name} required />
          </label>
        </p>
      ))}
      <p>
        <label>
          Card token <input name="paymentToken" required placeholder="tok_visa_4242" />
        </label>
      </p>
      {problem === undefined ? null : <p role="alert">{problem}</p>}
      <button type="submit" disabled={isPlacing}>
        Place the order
      </button>
    </form>
  );
}
