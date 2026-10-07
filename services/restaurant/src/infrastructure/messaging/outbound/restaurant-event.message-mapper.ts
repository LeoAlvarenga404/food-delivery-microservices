import { create, toBinary } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  DayOfWeek as ContractDayOfWeek,
  MenuRevisedSchema,
  RestaurantSchema,
  type MenuRevised as MenuRevisedContract,
  type Restaurant as RestaurantContract,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { MenuRevised } from '#domain/restaurant/menu-revised.event.ts';
import type { DayOfWeek } from '#domain/restaurant/opening-period.value-object.ts';
import type {
  RestaurantEvent,
  RestaurantSnapshot,
} from '#domain/restaurant/restaurant.aggregate.ts';

export type PublicRestaurant = Omit<RestaurantSnapshot, 'members'>;

const restaurantStateTopic = 'restaurant.restaurant.state';

const contractDaysOfWeek: Readonly<Record<DayOfWeek, ContractDayOfWeek>> = {
  MONDAY: ContractDayOfWeek.MONDAY,
  TUESDAY: ContractDayOfWeek.TUESDAY,
  WEDNESDAY: ContractDayOfWeek.WEDNESDAY,
  THURSDAY: ContractDayOfWeek.THURSDAY,
  FRIDAY: ContractDayOfWeek.FRIDAY,
  SATURDAY: ContractDayOfWeek.SATURDAY,
  SUNDAY: ContractDayOfWeek.SUNDAY,
};

export function toRestaurantContract(restaurant: PublicRestaurant): RestaurantContract {
  const { address } = restaurant;
  return create(RestaurantSchema, {
    restaurantId: restaurant.restaurantId,
    version: restaurant.version,
    name: restaurant.name,
    category: restaurant.category,
    address: {
      street: address.street,
      number: address.number,
      city: address.city,
      postalCode: address.postalCode,
      location: { latitude: address.location.latitude, longitude: address.location.longitude },
    },
    timeZone: restaurant.timeZone,
    openingHours: restaurant.openingHours.map(({ dayOfWeek, opensAt, closesAt }) => ({
      dayOfWeek: contractDaysOfWeek[dayOfWeek],
      opensAt,
      closesAt,
    })),
    minimumOrderInCents: restaurant.minimumOrderInCents,
    currency: 'BRL',
    menuItems: restaurant.menuItems.map(({ menuItemId, name, priceInCents, isAvailable }) => ({
      menuItemId,
      name,
      priceInCents,
      isAvailable,
    })),
  });
}

export function toMenuRevisedContract(event: MenuRevised): MenuRevisedContract {
  return create(MenuRevisedSchema, {
    restaurant: toRestaurantContract(event),
    revisedAt: timestampFromDate(event.occurredAt),
    members: event.staffMemberIds.map((staffMemberId) => ({ staffMemberId })),
  });
}

export function toRestaurantEventMessages(event: RestaurantEvent): readonly OutboxMessage[] {
  return [
    {
      topic: restaurantStateTopic,
      aggregateType: 'Restaurant',
      aggregateId: event.restaurantId,
      messageType: MenuRevisedSchema.typeName,
      payload: toBinary(MenuRevisedSchema, toMenuRevisedContract(event)),
      sagaId: undefined,
    },
  ];
}
