import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  parseRestaurantAddress,
  type RestaurantAddress,
} from './restaurant-address.value-object.ts';

const paulista: RestaurantAddress = {
  street: 'Avenida Paulista',
  number: '1000',
  city: 'Sao Paulo',
  postalCode: '01310-100',
  location: { latitude: -23.5614, longitude: -46.6559 },
};

describe('parseRestaurantAddress', () => {
  it('accepts a complete address with its location and trims every text field', () => {
    expect(
      parseRestaurantAddress({
        ...paulista,
        street: ' Avenida Paulista ',
        number: '1000 ',
        city: ' Sao Paulo',
        postalCode: ' 01310-100 ',
      }),
    ).toEqual(right(paulista));
  });

  it.each([
    { scenario: 'the poles and the antimeridian', latitude: -90, longitude: 180 },
    { scenario: 'the other pole and antimeridian', latitude: 90, longitude: -180 },
  ])('accepts a location at $scenario', ({ latitude, longitude }) => {
    const address = { ...paulista, location: { latitude, longitude } };

    expect(parseRestaurantAddress(address)).toEqual(right(address));
  });

  it('accepts text fields of exactly one hundred characters', () => {
    const longest = 'a'.repeat(100);
    const address = { ...paulista, street: longest, number: longest, city: longest };

    expect(parseRestaurantAddress(address)).toEqual(right(address));
  });

  it.each([
    { field: 'street', address: { ...paulista, street: ' ' } },
    { field: 'number', address: { ...paulista, number: '' } },
    { field: 'city', address: { ...paulista, city: 'a'.repeat(101) } },
    { field: 'postalCode', address: { ...paulista, postalCode: '01310\u0000100' } },
  ])('refuses an empty, too long or controlled $field', ({ field, address }) => {
    expect(parseRestaurantAddress(address)).toEqual(
      left({ type: 'InvalidRestaurantAddress', field }),
    );
  });

  it.each([
    { field: 'latitude', location: { latitude: 90.0001, longitude: 0 } },
    { field: 'latitude', location: { latitude: Number.NaN, longitude: 0 } },
    { field: 'longitude', location: { latitude: 0, longitude: -180.0001 } },
    { field: 'longitude', location: { latitude: 0, longitude: Number.POSITIVE_INFINITY } },
  ])('refuses a location with an impossible $field', ({ field, location }) => {
    expect(parseRestaurantAddress({ ...paulista, location })).toEqual(
      left({ type: 'InvalidRestaurantAddress', field }),
    );
  });
});
