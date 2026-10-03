import { createHash } from 'node:crypto';
import { toBinary } from '@bufbuild/protobuf';
import { left, right, type Either } from '@fd/domain';
import {
  PlaceOrderRequestSchema,
  type PlaceOrderRequest,
  type RequestedLineItem as RequestedLineItemContract,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { PlaceOrderCommand } from '#application/commands/place-order/place-order.command.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import { parseMenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import { parseConsumerId } from '#domain/order/consumer-id.value-object.ts';
import type { RequestedLineItem } from '#domain/order/order-placement.policy.ts';

export interface InvalidPlaceOrderRequest {
  readonly type: 'InvalidPlaceOrderRequest';
  readonly field: string;
}

function invalidField(field: string): Either<InvalidPlaceOrderRequest, never> {
  return left({ type: 'InvalidPlaceOrderRequest', field });
}

function parseLineItems(
  lineItems: readonly RequestedLineItemContract[],
): Either<InvalidPlaceOrderRequest, readonly RequestedLineItem[]> {
  const parsed: RequestedLineItem[] = [];
  for (const lineItem of lineItems) {
    const menuItemId = parseMenuItemId(lineItem.menuItemId);
    if (menuItemId.isLeft()) return invalidField('line_items.menu_item_id');
    parsed.push({ menuItemId: menuItemId.success, quantity: lineItem.quantity });
  }
  return right(parsed);
}

export function hashPlaceOrderRequest(request: PlaceOrderRequest): string {
  const payloadWithoutKey = toBinary(
    PlaceOrderRequestSchema,
    {
      ...request,
      idempotencyKey: '',
      consumerId: request.consumerId.toLowerCase(),
      restaurantId: request.restaurantId.toLowerCase(),
      lineItems: request.lineItems.map((lineItem) => ({
        ...lineItem,
        menuItemId: lineItem.menuItemId.toLowerCase(),
      })),
    },
    { writeUnknownFields: false },
  );
  return createHash('sha256').update(payloadWithoutKey).digest('hex');
}

export function toPlaceOrderCommand(
  request: PlaceOrderRequest,
  metadata: MessageMetadata,
): Either<InvalidPlaceOrderRequest, PlaceOrderCommand> {
  const consumerId = parseConsumerId(request.consumerId);
  const restaurantId = parseRestaurantId(request.restaurantId);
  const requestedLineItems = parseLineItems(request.lineItems);
  const { idempotencyKey, deliveryAddress, paymentToken } = request;
  if (idempotencyKey.trim().length === 0) return invalidField('idempotency_key');
  if (consumerId.isLeft()) return invalidField('consumer_id');
  if (restaurantId.isLeft()) return invalidField('restaurant_id');
  if (requestedLineItems.isLeft()) return requestedLineItems;
  if (deliveryAddress === undefined) return invalidField('delivery_address');
  if (paymentToken.trim().length === 0) return invalidField('payment_token');
  const { street, number, city, postalCode } = deliveryAddress;
  return right({
    idempotencyKey,
    requestHash: hashPlaceOrderRequest(request),
    consumerId: consumerId.success,
    restaurantId: restaurantId.success,
    requestedLineItems: requestedLineItems.success,
    deliveryAddress: { street, number, city, postalCode },
    paymentToken,
    metadata,
  });
}
