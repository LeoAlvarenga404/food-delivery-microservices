import type { Selectable } from 'kysely';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from '#domain/order/consumer-id.value-object.ts';
import { Order, type OrderSnapshot } from '#domain/order/order.aggregate.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderLineItemSnapshot } from '#domain/order/order-line-item.entity.ts';
import type { OrderState } from '#domain/order/order.state.ts';
import type { OrderLineItems, Orders } from './generated/database.ts';

export type OrderRow = Selectable<Orders>;
export type OrderLineItemRow = Selectable<OrderLineItems>;

export interface OrderRows {
  readonly order: OrderRow;
  readonly lineItems: readonly OrderLineItemRow[];
}

function toOrderState(order: OrderRow): OrderState {
  if (order.approvedAt === null) return { status: 'APPROVAL_PENDING' };
  return { status: 'APPROVED', approvedAt: order.approvedAt };
}

function toLineItemSnapshot(lineItem: OrderLineItemRow): OrderLineItemSnapshot {
  return {
    menuItemId: lineItem.menuItemId as MenuItemId,
    name: lineItem.name,
    unitPriceInCents: lineItem.unitPriceInCents,
    quantity: lineItem.quantity,
  };
}

function toOrderRow(snapshot: OrderSnapshot): OrderRow {
  const { deliveryAddress, state } = snapshot;
  return {
    orderId: snapshot.orderId,
    consumerId: snapshot.consumerId,
    restaurantId: snapshot.restaurantId,
    status: state.status,
    totalInCents: snapshot.totalInCents,
    currency: snapshot.currency,
    deliveryStreet: deliveryAddress.street,
    deliveryNumber: deliveryAddress.number,
    deliveryCity: deliveryAddress.city,
    deliveryPostalCode: deliveryAddress.postalCode,
    placedAt: snapshot.placedAt,
    approvedAt: state.status === 'APPROVED' ? state.approvedAt : null,
    version: snapshot.version,
  };
}

export const orderPersistenceMapper = {
  toDomain(rows: OrderRows): Order {
    const { order } = rows;
    return Order.restore({
      orderId: order.orderId as OrderId,
      consumerId: order.consumerId as ConsumerId,
      restaurantId: order.restaurantId as RestaurantId,
      lineItems: rows.lineItems.map(toLineItemSnapshot),
      totalInCents: order.totalInCents,
      currency: order.currency as Currency,
      deliveryAddress: {
        street: order.deliveryStreet,
        number: order.deliveryNumber,
        city: order.deliveryCity,
        postalCode: order.deliveryPostalCode,
      },
      placedAt: order.placedAt,
      state: toOrderState(order),
      version: order.version,
    });
  },

  toPersistence(snapshot: OrderSnapshot): OrderRows {
    return {
      order: toOrderRow(snapshot),
      lineItems: snapshot.lineItems.map((lineItem, index) => ({
        orderId: snapshot.orderId,
        lineNumber: index + 1,
        ...lineItem,
      })),
    };
  },
};
