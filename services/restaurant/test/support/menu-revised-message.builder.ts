import { create, toBinary, type MessageInitShape } from '@bufbuild/protobuf';
import type { InboundMessage, MessageHeaders } from '@fd/chassis-kafka';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { SearchableRestaurant } from '#application/ports/restaurant-search-index.port.ts';
import { toRestaurantContract } from '#infrastructure/messaging/outbound/restaurant-event.message-mapper.ts';

let builtMessageCount = 0;

function nextMessageId(): string {
  builtMessageCount += 1;
  return `0199a5d0-0000-7000-8000-${(0xf00 + builtMessageCount).toString(16).padStart(12, '0')}`;
}

export function menuRevisedOf(
  restaurant: SearchableRestaurant,
): MessageInitShape<typeof MenuRevisedSchema> {
  return { restaurant: toRestaurantContract(restaurant) };
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
      correlationId: '0199a5d0-0000-7000-8000-0000000000e3',
      causationId: undefined,
      sagaId: undefined,
      actorId: '0199a5d0-0000-7000-8000-0000000000e1',
      actorType: 'restaurant_staff',
      ...headers,
    },
  };
}
