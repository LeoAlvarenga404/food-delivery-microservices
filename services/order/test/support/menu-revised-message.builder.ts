import { create, toBinary, type MessageInitShape } from '@bufbuild/protobuf';
import type { InboundMessage, MessageHeaders } from '@fd/chassis-kafka';
import {
  DayOfWeek as ContractDayOfWeek,
  MenuRevisedSchema,
  type RestaurantSchema,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { DayOfWeek } from '#domain/menu/opening-hours.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';

export type RestaurantSnapshot = MessageInitShape<typeof RestaurantSchema>;

const contractDaysOfWeek: Readonly<Record<DayOfWeek, ContractDayOfWeek>> = {
  MONDAY: ContractDayOfWeek.MONDAY,
  TUESDAY: ContractDayOfWeek.TUESDAY,
  WEDNESDAY: ContractDayOfWeek.WEDNESDAY,
  THURSDAY: ContractDayOfWeek.THURSDAY,
  FRIDAY: ContractDayOfWeek.FRIDAY,
  SATURDAY: ContractDayOfWeek.SATURDAY,
  SUNDAY: ContractDayOfWeek.SUNDAY,
};

let builtMessageCount = 0;

function nextMessageId(): string {
  builtMessageCount += 1;
  return `0199a5d0-0000-7000-8000-${(0xf00 + builtMessageCount).toString(16).padStart(12, '0')}`;
}

export function snapshotOf(menu: RestaurantMenu): RestaurantSnapshot {
  return {
    restaurantId: menu.restaurantId,
    version: menu.version,
    name: 'Pizzaria Bella',
    category: 'Pizza',
    timeZone: menu.openingHours.timeZone,
    openingHours: menu.openingHours.periods.map(({ dayOfWeek, opensAt, closesAt }) => ({
      dayOfWeek: contractDaysOfWeek[dayOfWeek],
      opensAt,
      closesAt,
    })),
    minimumOrderInCents: menu.minimumOrderInCents,
    currency: 'BRL',
    menuItems: menu.items.map(({ menuItemId, name, priceInCents, isAvailable }) => ({
      menuItemId,
      name,
      priceInCents,
      isAvailable,
    })),
  };
}

export function buildMenuRevisedMessage(
  menuRevised: MessageInitShape<typeof MenuRevisedSchema>,
  headers: Partial<MessageHeaders> = {},
): InboundMessage {
  const message = create(MenuRevisedSchema, menuRevised);
  return {
    topic: 'restaurant.restaurant.state',
    partition: 0,
    offset: '0',
    key: message.restaurant?.restaurantId,
    payload: toBinary(MenuRevisedSchema, message),
    headers: {
      messageId: nextMessageId(),
      messageType: MenuRevisedSchema.typeName,
      correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
      causationId: undefined,
      sagaId: undefined,
      actorId: '0199a5d0-0000-7000-8000-0000000000e2',
      actorType: 'restaurant_staff',
      ...headers,
    },
  };
}
