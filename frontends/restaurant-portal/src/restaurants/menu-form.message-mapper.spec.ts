import { describe, expect, it } from 'vitest';
import type { RestaurantView } from '../restaurant-api/restaurant-api.adapter.ts';
import {
  describeRevision,
  menuFormSchema,
  newMenuRow,
  toMenuForm,
} from './menu-form.message-mapper.ts';

const lasagnaId = '0199a5d0-0000-7000-8000-000000000e01';
const tiramisuId = '0199a5d0-0000-7000-8000-000000000e02';
const restaurant: RestaurantView = {
  restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
  version: 2,
  name: 'Cantina Nonna',
  category: 'Italian',
  address: {
    street: 'Rua Augusta',
    number: '1500',
    city: 'Sao Paulo',
    postalCode: '01304-001',
    location: { latitude: -23.5614, longitude: -46.6559 },
  },
  timeZone: 'America/Sao_Paulo',
  openingHours: [{ dayOfWeek: 'MONDAY', opensAt: '11:00', closesAt: '23:00' }],
  minimumOrderInCents: '2000',
  currency: 'BRL',
  menuItems: [
    { menuItemId: lasagnaId, name: 'Lasagna', priceInCents: '3990', isAvailable: true },
    { menuItemId: tiramisuId, name: 'Tiramisu', priceInCents: '1800', isAvailable: false },
  ],
};

describe('the menu form', () => {
  it('shows every item of the restaurant with its price as an amount', () => {
    expect(toMenuForm(restaurant)).toEqual({
      menuRows: [
        { menuItemId: lasagnaId, name: 'Lasagna', price: '39.90', isAvailable: true },
        { menuItemId: tiramisuId, name: 'Tiramisu', price: '18.00', isAvailable: false },
      ],
    });
  });

  it('sends back the same items it showed, under the same ids', () => {
    expect(menuFormSchema.parse(toMenuForm(restaurant))).toEqual(restaurant.menuItems);
  });

  it('sends a revised price in cents', () => {
    const [lasagna, tiramisu] = toMenuForm(restaurant).menuRows;
    const menuRows = [lasagna, tiramisu].flatMap((menuRow) =>
      menuRow === undefined
        ? []
        : [menuRow.name === 'Lasagna' ? { ...menuRow, price: '42.5' } : menuRow],
    );

    expect(menuFormSchema.parse({ menuRows }).map(({ priceInCents }) => priceInCents)).toEqual([
      '4250',
      '1800',
    ]);
  });

  it('adds an available item without a name or a price under the id it was given', () => {
    expect(newMenuRow(lasagnaId)).toEqual({
      menuItemId: lasagnaId,
      name: '',
      price: '',
      isAvailable: true,
    });
  });

  it('refuses a price that is not an amount before sending the menu', () => {
    const parsed = menuFormSchema.safeParse({
      menuRows: [{ ...newMenuRow(lasagnaId), price: 'free' }],
    });

    expect(parsed.error?.issues.map(({ path, message }) => [path.join('.'), message])).toEqual([
      ['menuRows.0.price', 'Write a price such as 39.90.'],
    ]);
  });

  it.each([
    [undefined, ''],
    [{ version: 3 }, 'Menu saved as version 3.'],
    [
      { problem: 'Check the name and the price of every item.' },
      'Check the name and the price of every item.',
    ],
  ])('describes the revision %j', (revised, expected) => {
    expect(describeRevision(revised)).toBe(expected);
  });
});
