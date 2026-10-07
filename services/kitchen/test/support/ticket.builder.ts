import type { Either } from '@fd/domain';
import { parseConsumerId, type ConsumerId } from '#domain/ticket/consumer-id.value-object.ts';
import { parseMenuItemId, type MenuItemId } from '#domain/ticket/menu-item-id.value-object.ts';
import { parseOrderId, type OrderId } from '#domain/ticket/order-id.value-object.ts';
import {
  parsePreparationTime,
  type PreparationTimeInMinutes,
} from '#domain/ticket/preparation-time.value-object.ts';
import { parseRestaurantId, type RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import { parseTicketId, type TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { Ticket, type CreateTicketInput } from '#domain/ticket/ticket.aggregate.ts';
import type { TicketState } from '#domain/ticket/ticket.state.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const ticketId: TicketId = unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000f1'));
export const orderId: OrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000a1'));
export const restaurantId: RestaurantId = unwrap(
  parseRestaurantId('0199a5d0-0000-7000-8000-000000000001'),
);
export const consumerId: ConsumerId = unwrap(
  parseConsumerId('0199a5d0-0000-7000-8000-0000000000c1'),
);
export const margheritaId: MenuItemId = unwrap(
  parseMenuItemId('0199a5d0-0000-7000-8000-000000000101'),
);
export const guaranaId: MenuItemId = unwrap(
  parseMenuItemId('0199a5d0-0000-7000-8000-000000000103'),
);
export const fifteenMinutes: PreparationTimeInMinutes = unwrap(parsePreparationTime(15));
export const acceptedAt = new Date('2026-10-06T18:00:00.000Z');
export const readyBy = new Date('2026-10-06T18:15:00.000Z');

export function createTicketInput(overrides: Partial<CreateTicketInput> = {}): CreateTicketInput {
  return {
    ticketId,
    orderId,
    restaurantId,
    consumerId,
    lineItems: [
      { menuItemId: margheritaId, name: 'Margherita', quantity: 2 },
      { menuItemId: guaranaId, name: 'Guarana', quantity: 1 },
    ],
    ...overrides,
  };
}

export function buildTicket(overrides: Partial<CreateTicketInput> = {}): Ticket {
  return unwrap(Ticket.create(createTicketInput(overrides)));
}

export function buildTicketIn(
  state: TicketState,
  overrides: Partial<CreateTicketInput> = {},
): Ticket {
  return Ticket.restore({ ...createTicketInput(overrides), state, version: 1 });
}
