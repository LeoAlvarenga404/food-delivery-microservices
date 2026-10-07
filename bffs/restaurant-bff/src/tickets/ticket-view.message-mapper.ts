import { timestampDate } from '@bufbuild/protobuf/wkt';
import { TicketStatus, type Ticket } from '@fd/contracts/fooddelivery/kitchen/v1/service_pb.js';
import { z } from 'zod';

export const ticketViewSchema = z.object({
  ticketId: z.uuid(),
  orderId: z.uuid(),
  status: z.enum(['AWAITING_ACCEPTANCE', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']),
  lineItems: z.array(z.object({ menuItemId: z.string(), name: z.string(), quantity: z.int() })),
  readyBy: z.iso.datetime().optional(),
});

export const ticketsViewSchema = z.object({ tickets: z.array(ticketViewSchema) });

export type TicketView = z.infer<typeof ticketViewSchema>;

const statusNames = new Map<TicketStatus, TicketView['status']>([
  [TicketStatus.AWAITING_ACCEPTANCE, 'AWAITING_ACCEPTANCE'],
  [TicketStatus.ACCEPTED, 'ACCEPTED'],
  [TicketStatus.PREPARING, 'PREPARING'],
  [TicketStatus.READY_FOR_PICKUP, 'READY_FOR_PICKUP'],
]);

function toStatusName(status: TicketStatus): TicketView['status'] {
  const statusName = statusNames.get(status);
  if (statusName === undefined) {
    throw new Error('the kitchen service answered a ticket status the kitchen does not show');
  }
  return statusName;
}

export function toTicketView(ticket: Ticket | undefined): TicketView {
  if (ticket === undefined) throw new Error('the kitchen service answered without a ticket');
  return {
    ticketId: ticket.ticketId,
    orderId: ticket.orderId,
    status: toStatusName(ticket.status),
    lineItems: ticket.lineItems.map(({ menuItemId, name, quantity }) => ({
      menuItemId,
      name,
      quantity,
    })),
    ...(ticket.readyBy === undefined
      ? {}
      : { readyBy: timestampDate(ticket.readyBy).toISOString() }),
  };
}
