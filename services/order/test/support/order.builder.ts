import type { Either } from '@fd/domain';
import { parseMenuItemId, type MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { Money } from '#domain/money/money.value-object.ts';
import { parseConsumerId } from '#domain/order/consumer-id.value-object.ts';
import { Order } from '#domain/order/order.aggregate.ts';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import type { PlaceOrderInput } from '#domain/order/order-placement.policy.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const margheritaId: MenuItemId = unwrap(
  parseMenuItemId('0199a5d0-0000-7000-8000-000000000101'),
);
export const calabresaId: MenuItemId = unwrap(
  parseMenuItemId('0199a5d0-0000-7000-8000-000000000102'),
);
export const guaranaId: MenuItemId = unwrap(
  parseMenuItemId('0199a5d0-0000-7000-8000-000000000103'),
);

export const pizzeriaMenu: RestaurantMenu = {
  restaurantId: unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-000000000001')),
  items: [
    { menuItemId: margheritaId, name: 'Margherita', price: Money.of(4500n, 'BRL') },
    { menuItemId: calabresaId, name: 'Calabresa', price: Money.of(5200n, 'BRL') },
    { menuItemId: guaranaId, name: 'Guarana', price: Money.of(800n, 'BRL') },
  ],
};

export function orderInput(overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    orderId: unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000a1')),
    consumerId: unwrap(parseConsumerId('0199a5d0-0000-7000-8000-0000000000c1')),
    menu: pizzeriaMenu,
    requestedLineItems: [
      { menuItemId: margheritaId, quantity: 2 },
      { menuItemId: guaranaId, quantity: 1 },
    ],
    deliveryAddress: {
      street: 'Rua Augusta',
      number: '1500',
      city: 'Sao Paulo',
      postalCode: '01304-001',
    },
    placedAt: new Date('2026-10-02T12:00:00.000Z'),
    ...overrides,
  };
}

export function buildOrder(overrides: Partial<PlaceOrderInput> = {}): Order {
  return unwrap(Order.place(orderInput(overrides)));
}
