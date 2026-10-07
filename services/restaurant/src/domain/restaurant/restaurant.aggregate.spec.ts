import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  buildRestaurant,
  guarana,
  menuOf,
  onboardedAt,
  onboardRestaurant,
  pizzeriaId,
  pizzeriaProfile,
  staffAId,
  staffBId,
} from '../../../test/support/restaurant.builder.ts';
import { Restaurant } from './restaurant.aggregate.ts';

const revisedAt = new Date('2026-10-04T12:30:00.000Z');

describe('Restaurant.onboard', () => {
  it('onboards a restaurant with an empty menu and the caller as its owner', () => {
    const restaurant = onboardRestaurant();

    expect(restaurant.toSnapshot()).toEqual({
      restaurantId: pizzeriaId,
      ...pizzeriaProfile,
      menuItems: [],
      members: [{ staffMemberId: staffAId, role: 'OWNER' }],
      version: 0,
    });
  });

  it('records the full public state as the first menu revision', () => {
    expect(onboardRestaurant().pullRecordedEvents()).toEqual([
      {
        eventType: 'MenuRevised',
        occurredAt: onboardedAt,
        restaurantId: pizzeriaId,
        ...pizzeriaProfile,
        menuItems: [],
        staffMemberIds: [staffAId],
        version: 1,
      },
    ]);
  });

  it('refuses an invalid profile and records nothing', () => {
    const onboarding = Restaurant.onboard({
      restaurantId: pizzeriaId,
      owner: staffAId,
      profile: { ...pizzeriaProfile, timeZone: 'Paulista' },
      onboardedAt,
    });

    expect(onboarding).toEqual(left({ type: 'InvalidTimeZone' }));
  });
});

describe('Restaurant.reviseMenu', () => {
  it('replaces the menu when a member revises it', () => {
    const restaurant = buildRestaurant({ version: 3 });

    const revision = restaurant.reviseMenu(staffAId, menuOf([guarana]), revisedAt);

    expect(revision).toEqual(right(undefined));
    expect(restaurant.toSnapshot()).toEqual({
      ...buildRestaurant({ version: 3 }).toSnapshot(),
      menuItems: [guarana],
    });
  });

  it('records the full public state with the next version', () => {
    const restaurant = buildRestaurant({
      version: 3,
      members: [
        { staffMemberId: staffAId, role: 'OWNER' },
        { staffMemberId: staffBId, role: 'OWNER' },
      ],
    });

    restaurant.reviseMenu(staffAId, menuOf([guarana]), revisedAt);

    expect(restaurant.pullRecordedEvents()).toEqual([
      {
        eventType: 'MenuRevised',
        occurredAt: revisedAt,
        restaurantId: pizzeriaId,
        ...pizzeriaProfile,
        menuItems: [guarana],
        staffMemberIds: [staffAId, staffBId],
        version: 4,
      },
    ]);
  });

  it('refuses a staff member who is not a member, keeping the menu and recording nothing', () => {
    const restaurant = buildRestaurant();

    const revision = restaurant.reviseMenu(staffBId, menuOf([]), revisedAt);

    expect(revision).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId: pizzeriaId, staffMemberId: staffBId }),
    );
    expect(restaurant.toSnapshot()).toEqual(buildRestaurant().toSnapshot());
    expect(restaurant.pullRecordedEvents()).toEqual([]);
  });
});

describe('Restaurant.verifyMember', () => {
  it('admits a member of the restaurant', () => {
    expect(buildRestaurant().verifyMember(staffAId)).toEqual(right(undefined));
  });

  it('refuses another staff member', () => {
    expect(buildRestaurant().verifyMember(staffBId)).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId: pizzeriaId, staffMemberId: staffBId }),
    );
  });
});

describe('Restaurant.restore', () => {
  it('restores a snapshot without recording a revision', () => {
    const restaurant = buildRestaurant({ version: 7 });

    expect(restaurant.toSnapshot().version).toBe(7);
    expect(restaurant.pullRecordedEvents()).toEqual([]);
  });
});
