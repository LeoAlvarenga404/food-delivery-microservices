import { describe, expect, it } from 'vitest';
import {
  addToCart,
  cartTotalInCents,
  parseStoredCart,
  toOrderPlacement,
  type CartAddition,
} from './cart.hook.ts';

const margherita: CartAddition = {
  restaurantId: '0199a5d0-0000-7000-8000-00000000c001',
  restaurantName: 'Pizzaria Bella',
  currency: 'BRL',
  menuItemId: '0199a5d0-0000-7000-8000-000000000101',
  name: 'Margherita',
  priceInCents: '4500',
};
const calabresa: CartAddition = {
  ...margherita,
  menuItemId: '0199a5d0-0000-7000-8000-000000000102',
  name: 'Calabresa',
  priceInCents: '5200',
};
const temaki: CartAddition = {
  restaurantId: '0199a5d0-0000-7000-8000-00000000c002',
  restaurantName: 'Sushi Kaze',
  currency: 'USD',
  menuItemId: '0199a5d0-0000-7000-8000-000000000201',
  name: 'Temaki',
  priceInCents: '3100',
};
const firstKey = '0199a5d0-0000-7000-8000-0000000000a1';
const secondKey = '0199a5d0-0000-7000-8000-0000000000b2';
const thirdKey = '0199a5d0-0000-7000-8000-0000000000c3';

function cartOfTwoMargheritasAndOneCalabresa(): ReturnType<typeof addToCart> {
  const withMargherita = addToCart(undefined, margherita, firstKey);
  return addToCart(addToCart(withMargherita, calabresa, secondKey), margherita, thirdKey);
}

describe('addToCart', () => {
  it('starts a cart for the restaurant of the first item, with one of it and a checkout key', () => {
    expect(addToCart(undefined, margherita, firstKey)).toEqual({
      restaurantId: margherita.restaurantId,
      restaurantName: 'Pizzaria Bella',
      currency: 'BRL',
      lines: [
        {
          menuItemId: margherita.menuItemId,
          name: 'Margherita',
          priceInCents: '4500',
          quantity: 1,
        },
      ],
      checkoutKey: firstKey,
    });
  });

  it('counts an item added again and adds another item of the restaurant as a new line', () => {
    expect(cartOfTwoMargheritasAndOneCalabresa().lines).toEqual([
      { menuItemId: margherita.menuItemId, name: 'Margherita', priceInCents: '4500', quantity: 2 },
      { menuItemId: calabresa.menuItemId, name: 'Calabresa', priceInCents: '5200', quantity: 1 },
    ]);
  });

  it('takes the new checkout key whenever the cart changes, so a changed cart is a new attempt', () => {
    const first = addToCart(undefined, margherita, firstKey);
    const second = addToCart(first, margherita, secondKey);

    expect(first.checkoutKey).toBe(firstKey);
    expect(second.checkoutKey).toBe(secondKey);
  });

  it('replaces the cart when an item of another restaurant is added', () => {
    const cart = addToCart(addToCart(undefined, margherita, firstKey), temaki, secondKey);

    expect(cart).toEqual({
      restaurantId: temaki.restaurantId,
      restaurantName: 'Sushi Kaze',
      currency: 'USD',
      lines: [{ menuItemId: temaki.menuItemId, name: 'Temaki', priceInCents: '3100', quantity: 1 }],
      checkoutKey: secondKey,
    });
  });
});

describe('cartTotalInCents', () => {
  it('multiplies each price by its quantity and adds the lines', () => {
    expect(cartTotalInCents(cartOfTwoMargheritasAndOneCalabresa())).toBe('14200');
  });

  it('keeps amounts beyond the safe integer range exact', () => {
    const expensive = { ...margherita, priceInCents: '9007199254740993' };
    const cart = addToCart(addToCart(undefined, expensive, firstKey), expensive, secondKey);

    expect(cartTotalInCents(cart)).toBe('18014398509481986');
  });
});

describe('toOrderPlacement', () => {
  it('orders the lines of the cart under its checkout key, so a retried cart is one order', () => {
    const deliveryAddress = {
      street: 'Rua Augusta',
      number: '1500',
      city: 'Sao Paulo',
      postalCode: '01304-001',
    };

    const placement = toOrderPlacement(cartOfTwoMargheritasAndOneCalabresa(), {
      deliveryAddress,
      paymentToken: 'tok_visa_0001',
    });

    expect(placement).toEqual({
      restaurantId: margherita.restaurantId,
      lineItems: [
        { menuItemId: margherita.menuItemId, quantity: 2 },
        { menuItemId: calabresa.menuItemId, quantity: 1 },
      ],
      deliveryAddress,
      paymentToken: 'tok_visa_0001',
      idempotencyKey: thirdKey,
    });
  });
});

describe('parseStoredCart', () => {
  const storedCart = addToCart(undefined, margherita, firstKey);

  it('reads back a stored cart', () => {
    expect(parseStoredCart(JSON.stringify(storedCart))).toEqual(storedCart);
  });

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', '{"restaurantId":'],
    ['a cart without a checkout key', JSON.stringify({ ...storedCart, checkoutKey: undefined })],
    [
      'a line with no quantity',
      JSON.stringify({ ...storedCart, lines: [{ ...storedCart.lines[0], quantity: 0 }] }),
    ],
    [
      'a currency that is not a three-letter code',
      JSON.stringify({ ...storedCart, currency: 'X' }),
    ],
  ])('reads %s as no cart', (description, stored) => {
    expect(parseStoredCart(stored)).toBeUndefined();
  });
});
