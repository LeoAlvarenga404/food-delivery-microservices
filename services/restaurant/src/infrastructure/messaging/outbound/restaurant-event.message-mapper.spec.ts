import { fromBinary } from '@bufbuild/protobuf';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  DayOfWeek,
  MenuRevisedSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import {
  buildRestaurant,
  guarana,
  margherita,
  menuOf,
  pizzeriaId,
  staffAId,
  staffBId,
  unwrap,
} from '../../../../test/support/restaurant.builder.ts';
import type { MenuRevised } from '#domain/restaurant/menu-revised.event.ts';
import type { DayOfWeek as DomainDayOfWeek } from '#domain/restaurant/opening-period.value-object.ts';
import { toRestaurantEventMessages } from './restaurant-event.message-mapper.ts';

const revisedAt = new Date('2026-10-04T12:30:00.000Z');
const contractDaysOfWeek: readonly {
  readonly dayOfWeek: DomainDayOfWeek;
  readonly contractDayOfWeek: DayOfWeek;
}[] = [
  { dayOfWeek: 'MONDAY', contractDayOfWeek: DayOfWeek.MONDAY },
  { dayOfWeek: 'TUESDAY', contractDayOfWeek: DayOfWeek.TUESDAY },
  { dayOfWeek: 'WEDNESDAY', contractDayOfWeek: DayOfWeek.WEDNESDAY },
  { dayOfWeek: 'THURSDAY', contractDayOfWeek: DayOfWeek.THURSDAY },
  { dayOfWeek: 'FRIDAY', contractDayOfWeek: DayOfWeek.FRIDAY },
  { dayOfWeek: 'SATURDAY', contractDayOfWeek: DayOfWeek.SATURDAY },
  { dayOfWeek: 'SUNDAY', contractDayOfWeek: DayOfWeek.SUNDAY },
];

function revisedMenuEvent(): MenuRevised {
  const restaurant = buildRestaurant({ version: 1 });
  unwrap(restaurant.reviseMenu(staffAId, menuOf([margherita, guarana]), revisedAt));
  const [revised] = restaurant.pullRecordedEvents();
  if (revised === undefined) throw new Error('expected MenuRevised');
  return revised;
}

describe('toRestaurantEventMessages', () => {
  it('publishes a menu revision on the compacted state topic keyed by the restaurant id', () => {
    expect(toRestaurantEventMessages(revisedMenuEvent())).toMatchObject([
      {
        topic: 'restaurant.restaurant.state',
        aggregateType: 'Restaurant',
        aggregateId: pizzeriaId,
        messageType: 'fooddelivery.restaurant.v1.MenuRevised',
        sagaId: undefined,
      },
    ]);
  });

  it('carries the full public state of the restaurant with its version', () => {
    const [message] = toRestaurantEventMessages(revisedMenuEvent());

    const decoded = fromBinary(MenuRevisedSchema, message?.payload ?? new Uint8Array());

    expect(decoded.restaurant).toMatchObject({
      restaurantId: pizzeriaId,
      version: 2,
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
      openingHours: [
        { dayOfWeek: DayOfWeek.FRIDAY, opensAt: '18:00', closesAt: '23:30' },
        { dayOfWeek: DayOfWeek.SATURDAY, opensAt: '18:00', closesAt: '02:00' },
      ],
      minimumOrderInCents: 2000n,
      currency: 'BRL',
      menuItems: [margherita, guarana],
    });
    expect(decoded.revisedAt === undefined ? undefined : timestampDate(decoded.revisedAt)).toEqual(
      revisedAt,
    );
  });

  it('names the members of the restaurant beside the public state, so Kitchen can authorize them', () => {
    const [message] = toRestaurantEventMessages({
      ...revisedMenuEvent(),
      staffMemberIds: [staffAId, staffBId],
    });

    const decoded = fromBinary(MenuRevisedSchema, message?.payload ?? new Uint8Array());

    expect(decoded.members.map(({ staffMemberId }) => staffMemberId)).toEqual([staffAId, staffBId]);
    expect(decoded.restaurant).not.toHaveProperty('members');
  });

  it.each(contractDaysOfWeek)(
    'publishes $dayOfWeek as its contract day',
    ({ dayOfWeek, contractDayOfWeek }) => {
      const event = revisedMenuEvent();
      const [period] = event.openingHours;
      if (period === undefined) throw new Error('expected an opening period');

      const [message] = toRestaurantEventMessages({
        ...event,
        openingHours: [{ ...period, dayOfWeek }],
      });

      const decoded = fromBinary(MenuRevisedSchema, message?.payload ?? new Uint8Array());
      expect(decoded.restaurant?.openingHours[0]?.dayOfWeek).toBe(contractDayOfWeek);
    },
  );
});
