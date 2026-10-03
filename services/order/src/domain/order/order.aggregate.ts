import { AggregateRoot, left, right, type Either } from '@fd/domain';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import { Money, type Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from './consumer-id.value-object.ts';
import type { DeliveryAddress } from './delivery-address.value-object.ts';
import type { OrderApproved } from './order-approved.event.ts';
import type { InvalidOrderTransition, OrderPlacementError } from './order.errors.ts';
import type { OrderId } from './order-id.value-object.ts';
import { OrderLineItem, type OrderLineItemSnapshot } from './order-line-item.entity.ts';
import type { OrderPlaced } from './order-placed.event.ts';
import { orderPlacementPolicy, type PlaceOrderInput } from './order-placement.policy.ts';
import type { OrderRejected } from './order-rejected.event.ts';
import type { OrderRejectionReason, OrderState, OrderStatus } from './order.state.ts';

export type OrderEvent = OrderPlaced | OrderApproved | OrderRejected;

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
    const lineItems = orderPlacementPolicy.evaluate(input);
    if (lineItems.isLeft()) return lineItems;
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
    const leaving = this.#leaveApprovalPending('APPROVED');
    if (leaving.isLeft()) return leaving;
    this.#state = { status: 'APPROVED', approvedAt };
    this.recordEvent({
      eventType: 'OrderApproved',
      occurredAt: approvedAt,
      orderId: this.#orderId,
    });
    return right(undefined);
  }

  reject(
    rejectionReason: OrderRejectionReason,
    rejectedAt: Date,
  ): Either<InvalidOrderTransition, void> {
    const leaving = this.#leaveApprovalPending('REJECTED');
    if (leaving.isLeft()) return leaving;
    this.#state = { status: 'REJECTED', rejectionReason, rejectedAt };
    this.recordEvent({
      eventType: 'OrderRejected',
      occurredAt: rejectedAt,
      orderId: this.#orderId,
      rejectionReason,
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

  #leaveApprovalPending(to: OrderStatus): Either<InvalidOrderTransition, void> {
    if (this.#state.status === 'APPROVAL_PENDING') return right(undefined);
    return left({ type: 'InvalidOrderTransition', from: this.#state.status, to });
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
