import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import {
  DayOfWeek as ContractDayOfWeek,
  MenuRevisedSchema,
  type MenuRevised,
  type Restaurant as RestaurantContract,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { ApplyMenuRevisionCommand } from '#application/commands/apply-menu-revision/apply-menu-revision.command.ts';
import type { DayOfWeek } from '#domain/menu/opening-hours.value-object.ts';
import {
  parseRestaurantMenu,
  type RawRestaurantMenu,
} from '#domain/menu/restaurant-menu.value-object.ts';

const daysOfWeek = new Map<ContractDayOfWeek, DayOfWeek>([
  [ContractDayOfWeek.MONDAY, 'MONDAY'],
  [ContractDayOfWeek.TUESDAY, 'TUESDAY'],
  [ContractDayOfWeek.WEDNESDAY, 'WEDNESDAY'],
  [ContractDayOfWeek.THURSDAY, 'THURSDAY'],
  [ContractDayOfWeek.FRIDAY, 'FRIDAY'],
  [ContractDayOfWeek.SATURDAY, 'SATURDAY'],
  [ContractDayOfWeek.SUNDAY, 'SUNDAY'],
]);

function decode(payload: Uint8Array): MenuRevised {
  try {
    return fromBinary(MenuRevisedSchema, payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${MenuRevisedSchema.typeName}`, {
      cause: error,
    });
  }
}

function readRestaurant(message: InboundMessage): RestaurantContract {
  const { messageType } = message.headers;
  if (messageType !== MenuRevisedSchema.typeName) {
    throw new PermanentMessageFailure(`unknown restaurant state message ${messageType}`);
  }
  const { restaurant } = decode(message.payload);
  if (restaurant === undefined) {
    throw new PermanentMessageFailure('MenuRevised without a restaurant');
  }
  if (restaurant.currency !== 'BRL') {
    throw new PermanentMessageFailure('MenuRevised in an unsupported currency');
  }
  return restaurant;
}

function toRawMenu(restaurant: RestaurantContract): RawRestaurantMenu {
  return {
    restaurantId: restaurant.restaurantId,
    version: restaurant.version,
    openingHours: {
      timeZone: restaurant.timeZone,
      periods: restaurant.openingHours.map((period) => ({
        dayOfWeek: daysOfWeek.get(period.dayOfWeek) ?? '',
        opensAt: period.opensAt,
        closesAt: period.closesAt,
      })),
    },
    minimumOrderInCents: restaurant.minimumOrderInCents,
    items: restaurant.menuItems.map(({ menuItemId, name, priceInCents, isAvailable }) => ({
      menuItemId,
      name,
      priceInCents,
      isAvailable,
    })),
  };
}

export function toApplyMenuRevisionCommand(message: InboundMessage): ApplyMenuRevisionCommand {
  const menu = parseRestaurantMenu(toRawMenu(readRestaurant(message)));
  if (menu.isLeft()) {
    const { type, field } = menu.failure;
    throw new PermanentMessageFailure(`MenuRevised refused: ${type} ${field}`);
  }
  return { menu: menu.success };
}
