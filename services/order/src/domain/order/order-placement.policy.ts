import { left, right, type Either } from '@fd/domain';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import { isOpenAt } from '#domain/menu/opening-hours.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { Money } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from './consumer-id.value-object.ts';
import type { DeliveryAddress } from './delivery-address.value-object.ts';
import type { OrderPlacementError } from './order.errors.ts';
import type { OrderId } from './order-id.value-object.ts';
import { OrderLineItem } from './order-line-item.entity.ts';

export interface RequestedLineItem {
  readonly menuItemId: MenuItemId;
  readonly quantity: number;
}

export interface PlaceOrderInput {
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly menu: RestaurantMenu;
  readonly requestedLineItems: readonly RequestedLineItem[];
  readonly deliveryAddress: DeliveryAddress;
  readonly placedAt: Date;
  readonly deliveryFeeInCents: bigint;
}

function priceLineItem(
  menu: RestaurantMenu,
  requested: RequestedLineItem,
): Either<OrderPlacementError, OrderLineItem> {
  const { menuItemId, quantity } = requested;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return left({ type: 'InvalidQuantity', menuItemId, quantity });
  }
  const menuItem = menu.items.find((item) => item.menuItemId === menuItemId);
  if (menuItem === undefined) return left({ type: 'UnknownMenuItem', menuItemId });
  if (!menuItem.isAvailable) return left({ type: 'UnavailableMenuItem', menuItemId });
  return right(OrderLineItem.fromMenuItem(menuItem, quantity));
}

function findRepeatedLineItem(lineItems: readonly OrderLineItem[]): OrderLineItem | undefined {
  return lineItems.find((lineItem, index) =>
    lineItems.slice(0, index).some((earlier) => earlier.hasSameIdentityAs(lineItem)),
  );
}

function priceLineItems(
  input: PlaceOrderInput,
): Either<OrderPlacementError, readonly OrderLineItem[]> {
  if (input.requestedLineItems.length === 0) return left({ type: 'EmptyOrder' });
  const lineItems: OrderLineItem[] = [];
  for (const requested of input.requestedLineItems) {
    const priced = priceLineItem(input.menu, requested);
    if (priced.isLeft()) return priced;
    lineItems.push(priced.success);
  }
  const repeated = findRepeatedLineItem(lineItems);
  if (repeated !== undefined) {
    return left({ type: 'DuplicateMenuItem', menuItemId: repeated.toSnapshot().menuItemId });
  }
  return right(lineItems);
}

function isComplete(deliveryAddress: DeliveryAddress): boolean {
  const { street, number, city, postalCode } = deliveryAddress;
  return [street, number, city, postalCode].every((field) => field.trim().length > 0);
}

function totalInCentsOf(lineItems: readonly OrderLineItem[]): bigint {
  const total = lineItems.reduce((sum, lineItem) => sum.add(lineItem.total()), Money.zero('BRL'));
  return total.toSnapshot().amountInCents;
}

function meetRestaurantRules(
  input: PlaceOrderInput,
  lineItems: readonly OrderLineItem[],
): Either<OrderPlacementError, readonly OrderLineItem[]> {
  if (!isOpenAt(input.menu.openingHours, input.placedAt)) return left({ type: 'RestaurantClosed' });
  if (totalInCentsOf(lineItems) < input.menu.minimumOrderInCents) {
    return left({ type: 'MinimumOrderNotReached' });
  }
  return right(lineItems);
}

export const orderPlacementPolicy = {
  evaluate(input: PlaceOrderInput): Either<OrderPlacementError, readonly OrderLineItem[]> {
    const lineItems = priceLineItems(input);
    if (lineItems.isLeft()) return lineItems;
    if (!isComplete(input.deliveryAddress)) return left({ type: 'IncompleteDeliveryAddress' });
    return meetRestaurantRules(input, lineItems.success);
  },
};
