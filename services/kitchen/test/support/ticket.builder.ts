import type { Either } from '@fd/domain';
import { parseOrderId, type OrderId } from '#domain/ticket/order-id.value-object.ts';
import { parseTicketId, type TicketId } from '#domain/ticket/ticket-id.value-object.ts';
import { Ticket, type CreateTicketInput } from '#domain/ticket/ticket.aggregate.ts';

export function unwrap<Success>(either: Either<unknown, Success>): Success {
  if (either.isLeft()) throw new Error(`expected a right, got ${JSON.stringify(either.failure)}`);
  return either.success;
}

export const ticketId: TicketId = unwrap(parseTicketId('0199a5d0-0000-7000-8000-0000000000f1'));
export const orderId: OrderId = unwrap(parseOrderId('0199a5d0-0000-7000-8000-0000000000a1'));

export function createTicketInput(overrides: Partial<CreateTicketInput> = {}): CreateTicketInput {
  return {
    ticketId,
    orderId,
    restaurantId: '0199a5d0-0000-7000-8000-000000000001',
    lineItems: [
      { menuItemId: '0199a5d0-0000-7000-8000-000000000101', name: 'Margherita', quantity: 2 },
      { menuItemId: '0199a5d0-0000-7000-8000-000000000103', name: 'Guarana', quantity: 1 },
    ],
    ...overrides,
  };
}

export function buildTicket(overrides: Partial<CreateTicketInput> = {}): Ticket {
  return unwrap(Ticket.create(createTicketInput(overrides)));
}
