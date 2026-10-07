import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import {
  MenuRevisedSchema,
  type MenuRevised,
  type Restaurant as RestaurantContract,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { ProjectRestaurantCommand } from '#application/commands/project-restaurant/project-restaurant.command.ts';
import { parseMenu } from '#domain/restaurant/menu.value-object.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import { parseRestaurantProfile } from '#domain/restaurant/restaurant-profile.value-object.ts';
import {
  toRawMenuItems,
  toRawRestaurantProfile,
} from '#infrastructure/rpc/restaurant-request.message-mapper.ts';

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

function refused(reason: string): PermanentMessageFailure {
  return new PermanentMessageFailure(`MenuRevised refused: ${reason}`);
}

export function toProjectRestaurantCommand(message: InboundMessage): ProjectRestaurantCommand {
  const restaurant = readRestaurant(message);
  const restaurantId = parseRestaurantId(restaurant.restaurantId);
  if (restaurantId.isLeft()) throw refused(restaurantId.failure.type);
  if (restaurant.version < 1) throw refused('InvalidVersion');
  const profile = parseRestaurantProfile(toRawRestaurantProfile(restaurant));
  if (profile.isLeft()) throw refused(profile.failure.type);
  const menuItems = parseMenu(toRawMenuItems(restaurant.menuItems));
  if (menuItems.isLeft()) throw refused(menuItems.failure.type);
  return {
    restaurant: {
      restaurantId: restaurantId.success,
      version: restaurant.version,
      ...profile.success,
      menuItems: menuItems.success,
    },
  };
}
