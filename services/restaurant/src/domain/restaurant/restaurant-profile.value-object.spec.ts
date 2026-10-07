import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  parseRestaurantProfile,
  type RawRestaurantProfile,
} from './restaurant-profile.value-object.ts';

const fridayEvening = { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' };
const pizzeriaProfile: RawRestaurantProfile = {
  name: 'Pizzaria Bella',
  category: 'Pizza',
  address: {
    street: 'Avenida Paulista',
    number: '1000',
    city: 'Sao Paulo',
    postalCode: '01310-100',
    location: { latitude: -23.5614, longitude: -46.6559 },
  },
  timeZone: 'America/Sao_Paulo',
  openingHours: [fridayEvening],
  minimumOrderInCents: 2000n,
};

describe('parseRestaurantProfile', () => {
  it('accepts a complete profile', () => {
    expect(parseRestaurantProfile(pizzeriaProfile)).toEqual(right(pizzeriaProfile));
  });

  it('keeps the canonical name of the time zone', () => {
    expect(parseRestaurantProfile({ ...pizzeriaProfile, timeZone: 'Brazil/East' })).toEqual(
      right(pizzeriaProfile),
    );
  });

  it.each([0n, 10_000_000n])('accepts a minimum order of %i cents', (minimumOrderInCents) => {
    expect(parseRestaurantProfile({ ...pizzeriaProfile, minimumOrderInCents })).toEqual(
      right({ ...pizzeriaProfile, minimumOrderInCents }),
    );
  });

  it('accepts twenty-one opening periods', () => {
    const openingHours = Array.from({ length: 21 }, () => fridayEvening);

    expect(parseRestaurantProfile({ ...pizzeriaProfile, openingHours })).toEqual(
      right({ ...pizzeriaProfile, openingHours }),
    );
  });

  it.each([
    {
      failure: { type: 'InvalidRestaurantName' },
      profile: { ...pizzeriaProfile, name: '' },
    },
    {
      failure: { type: 'InvalidRestaurantCategory' },
      profile: { ...pizzeriaProfile, category: '' },
    },
    {
      failure: { type: 'InvalidRestaurantAddress', field: 'city' },
      profile: { ...pizzeriaProfile, address: { ...pizzeriaProfile.address, city: '' } },
    },
    {
      failure: { type: 'InvalidTimeZone' },
      profile: { ...pizzeriaProfile, timeZone: 'Sao Paulo' },
    },
    {
      failure: { type: 'InvalidOpeningPeriodCount', openingPeriodCount: 0 },
      profile: { ...pizzeriaProfile, openingHours: [] },
    },
    {
      failure: { type: 'InvalidOpeningPeriodCount', openingPeriodCount: 22 },
      profile: {
        ...pizzeriaProfile,
        openingHours: Array.from({ length: 22 }, () => fridayEvening),
      },
    },
    {
      failure: { type: 'InvalidOpeningPeriod', field: 'opensAt' },
      profile: { ...pizzeriaProfile, openingHours: [{ ...fridayEvening, opensAt: '6pm' }] },
    },
    {
      failure: { type: 'InvalidMinimumOrder' },
      profile: { ...pizzeriaProfile, minimumOrderInCents: -1n },
    },
    {
      failure: { type: 'InvalidMinimumOrder' },
      profile: { ...pizzeriaProfile, minimumOrderInCents: 10_000_001n },
    },
  ])('refuses a profile with $failure.type', ({ failure, profile }) => {
    expect(parseRestaurantProfile(profile)).toEqual(left(failure));
  });

  it('refuses the name before the category when both are invalid', () => {
    expect(parseRestaurantProfile({ ...pizzeriaProfile, name: '', category: '' })).toEqual(
      left({ type: 'InvalidRestaurantName' }),
    );
  });
});
