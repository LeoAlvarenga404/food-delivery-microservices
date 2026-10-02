import { AggregateRoot, left, right, type Either } from '@fd/domain';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { Money, type Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from './consumer-id.value-object.ts';
import type { DeliveryAddress } from './delivery-address.value-object.ts';
import type { OrderApproved } from './order-approved.event.ts';
import type { InvalidOrderTransition, OrderPlacementError } from './order.errors.ts';
import type { OrderId } from './order-id.value-object.ts';
import { OrderLineItem, type OrderLineItemSnapshot } from './order-line-item.entity.ts';
import type { OrderPlaced } from './order-placed.event.ts';
import type { OrderState } from './order.state.ts';

export type OrderEvent = OrderPlaced | OrderApproved;

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
}

export interface OrderSnapshot {
  readonly orderId: OrderId;
  readonly consumerId: ConsumerId;
  readonly restaurantId: RestaurantId;
  readonly lineItems: readonly OrderLineItemSnapshot[];
  readonly totalInCents: bigint;
  readonly currency: Currency;
  readonly deliveryAddress: DeliveryAddress;
  readonly placedAt: Date;
  readonly state: OrderState;
  readonly version: number;
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

export class Order extends AggregateRoot<OrderEvent> {
  readonly #orderId: OrderId;
  readonly #consumerId: ConsumerId;
  readonly #restaurantId: RestaurantId;
  readonly #lineItems: readonly OrderLineItem[];
  readonly #currency: Currency;
  readonly #deliveryAddress: DeliveryAddress;
  readonly #placedAt: Date;
  readonly #version: number;
  #state: OrderState;

  private constructor(snapshot: Omit<OrderSnapshot, 'totalInCents'>) {
    super();
    this.#orderId = snapshot.orderId;
    this.#consumerId = snapshot.consumerId;
    this.#restaurantId = snapshot.restaurantId;
    this.#lineItems = snapshot.lineItems.map((lineItem) =>
      OrderLineItem.restore(lineItem, snapshot.currency),
    );
    this.#currency = snapshot.currency;
    this.#deliveryAddress = snapshot.deliveryAddress;
    this.#placedAt = snapshot.placedAt;
    this.#version = snapshot.version;
    this.#state = snapshot.state;
  }

  static place(input: PlaceOrderInput): Either<OrderPlacementError, Order> {
    const lineItems = priceLineItems(input);
    if (lineItems.isLeft()) return lineItems;
    if (!isComplete(input.deliveryAddress)) return left({ type: 'IncompleteDeliveryAddress' });
    const order = new Order({
      orderId: input.orderId,
      consumerId: input.consumerId,
      restaurantId: input.menu.restaurantId,
      lineItems: lineItems.success.map((lineItem) => lineItem.toSnapshot()),
      currency: 'BRL',
      deliveryAddress: input.deliveryAddress,
      placedAt: input.placedAt,
      state: { status: 'APPROVAL_PENDING' },
      version: 0,
    });
    order.#recordPlacement();
    return right(order);
  }

  static restore(snapshot: OrderSnapshot): Order {
    return new Order(snapshot);
  }

  approve(approvedAt: Date): Either<InvalidOrderTransition, void> {
    if (this.#state.status !== 'APPROVAL_PENDING') {
      return left({ type: 'InvalidOrderTransition', from: this.#state.status, to: 'APPROVED' });
    }
    this.#state = { status: 'APPROVED', approvedAt };
    this.recordEvent({
      eventType: 'OrderApproved',
      occurredAt: approvedAt,
      orderId: this.#orderId,
    });
    return right(undefined);
  }

  toSnapshot(): OrderSnapshot {
    const total = this.#lineItems.reduce(
      (sum, lineItem) => sum.add(lineItem.total()),
      Money.zero(this.#currency),
    );
    return {
      orderId: this.#orderId,
      consumerId: this.#consumerId,
      restaurantId: this.#restaurantId,
      lineItems: this.#lineItems.map((lineItem) => lineItem.toSnapshot()),
      totalInCents: total.toSnapshot().amountInCents,
      currency: this.#currency,
      deliveryAddress: this.#deliveryAddress,
      placedAt: this.#placedAt,
      state: this.#state,
      version: this.#version,
    };
  }

  #recordPlacement(): void {
    const { orderId, consumerId, restaurantId, lineItems, totalInCents, currency } =
      this.toSnapshot();
    this.recordEvent({
      eventType: 'OrderPlaced',
      occurredAt: this.#placedAt,
      orderId,
      consumerId,
      restaurantId,
      lineItems,
      totalInCents,
      currency,
    });
  }
}
