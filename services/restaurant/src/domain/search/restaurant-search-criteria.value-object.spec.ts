import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  parseRestaurantSearchCriteria,
  type RestaurantSearchCriteria,
} from './restaurant-search-criteria.value-object.ts';

const nearPaulista: RestaurantSearchCriteria = {
  text: 'pizza',
  category: 'Pizzaria',
  origin: { latitude: -23.5614, longitude: -46.6559 },
  radiusInKilometers: 5,
  limit: 20,
};

describe('parseRestaurantSearchCriteria', () => {
  it('accepts a text, a category, an origin with a radius and a limit, trimming the texts', () => {
    expect(
      parseRestaurantSearchCriteria({ ...nearPaulista, text: '  pizza ', category: ' Pizzaria ' }),
    ).toEqual(right(nearPaulista));
  });

  it('accepts an empty text without category, origin or radius to browse every restaurant', () => {
    const browseEverything: RestaurantSearchCriteria = {
      text: '',
      category: undefined,
      origin: undefined,
      radiusInKilometers: undefined,
      limit: 1,
    };

    expect(parseRestaurantSearchCriteria(browseEverything)).toEqual(right(browseEverything));
  });

  it.each<{ readonly boundary: string; readonly criteria: RestaurantSearchCriteria }>([
    {
      boundary: 'a text of one hundred characters',
      criteria: { ...nearPaulista, text: 'a'.repeat(100) },
    },
    {
      boundary: 'a category of fifty characters',
      criteria: { ...nearPaulista, category: 'c'.repeat(50) },
    },
    {
      boundary: 'the poles and the antimeridian',
      criteria: { ...nearPaulista, origin: { latitude: -90, longitude: 180 } },
    },
    {
      boundary: 'the other pole and antimeridian',
      criteria: { ...nearPaulista, origin: { latitude: 90, longitude: -180 } },
    },
    {
      boundary: 'a radius of fifty kilometers',
      criteria: { ...nearPaulista, radiusInKilometers: 50 },
    },
    {
      boundary: 'an origin without a radius',
      criteria: { ...nearPaulista, radiusInKilometers: undefined },
    },
    { boundary: 'a limit of fifty', criteria: { ...nearPaulista, limit: 50 } },
  ])('accepts $boundary', ({ criteria }) => {
    expect(parseRestaurantSearchCriteria(criteria)).toEqual(right(criteria));
  });

  it.each<{ readonly field: string; readonly criteria: RestaurantSearchCriteria }>([
    { field: 'text', criteria: { ...nearPaulista, text: 'a'.repeat(101) } },
    { field: 'text', criteria: { ...nearPaulista, text: 'pizza\u0007' } },
    { field: 'category', criteria: { ...nearPaulista, category: 'c'.repeat(51) } },
    { field: 'category', criteria: { ...nearPaulista, category: '   ' } },
    { field: 'category', criteria: { ...nearPaulista, category: 'Pizza\u0000ria' } },
    {
      field: 'origin',
      criteria: { ...nearPaulista, origin: { latitude: 90.000001, longitude: 0 } },
    },
    {
      field: 'origin',
      criteria: { ...nearPaulista, origin: { latitude: 0, longitude: -180.000001 } },
    },
    {
      field: 'origin',
      criteria: { ...nearPaulista, origin: { latitude: -90.000001, longitude: 0 } },
    },
    {
      field: 'origin',
      criteria: { ...nearPaulista, origin: { latitude: 0, longitude: 180.000001 } },
    },
    {
      field: 'origin',
      criteria: { ...nearPaulista, origin: { latitude: Number.NaN, longitude: 0 } },
    },
    {
      field: 'origin',
      criteria: { ...nearPaulista, origin: { latitude: 0, longitude: Number.NaN } },
    },
    { field: 'radiusInKilometers', criteria: { ...nearPaulista, radiusInKilometers: 50.01 } },
    { field: 'radiusInKilometers', criteria: { ...nearPaulista, radiusInKilometers: 0 } },
    { field: 'radiusInKilometers', criteria: { ...nearPaulista, radiusInKilometers: -5 } },
    { field: 'radiusInKilometers', criteria: { ...nearPaulista, radiusInKilometers: Number.NaN } },
    {
      field: 'radiusInKilometers',
      criteria: { ...nearPaulista, origin: undefined, radiusInKilometers: 5 },
    },
    { field: 'limit', criteria: { ...nearPaulista, limit: 0 } },
    { field: 'limit', criteria: { ...nearPaulista, limit: -1 } },
    { field: 'limit', criteria: { ...nearPaulista, limit: 51 } },
    { field: 'limit', criteria: { ...nearPaulista, limit: 2.5 } },
  ])('refuses an invalid $field', ({ field, criteria }) => {
    expect(parseRestaurantSearchCriteria(criteria)).toEqual(
      left({ type: 'InvalidSearchCriteria', field }),
    );
  });
});
