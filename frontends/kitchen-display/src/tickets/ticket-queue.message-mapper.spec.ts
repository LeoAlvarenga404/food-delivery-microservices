import { describe, expect, it } from 'vitest';
import type { Ticket } from '../restaurant-api/restaurant-api.adapter.ts';
import { formatReadyBy, groupTicketsByStatus } from './ticket-queue.message-mapper.ts';

function ticketOf(ticketNumber: number, status: Ticket['status']): Ticket {
  return {
    ticketId: `0199a5d0-0000-7000-8000-0000000000f${String(ticketNumber)}`,
    orderId: `0199a5d0-0000-7000-8000-0000000000a${String(ticketNumber)}`,
    status,
    lineItems: [
      { menuItemId: '0199a5d0-0000-7000-8000-000000000102', name: 'Calabresa', quantity: 1 },
    ],
  };
}

describe('groupTicketsByStatus', () => {
  it('shows the four steps of the kitchen in order, keeping the order of the tickets in each', () => {
    const first = ticketOf(3, 'PREPARING');
    const second = ticketOf(2, 'AWAITING_ACCEPTANCE');
    const third = ticketOf(1, 'PREPARING');
    const fourth = ticketOf(4, 'READY_FOR_PICKUP');

    expect(groupTicketsByStatus([first, second, third, fourth])).toEqual([
      { status: 'AWAITING_ACCEPTANCE', heading: 'Awaiting acceptance', tickets: [second] },
      { status: 'ACCEPTED', heading: 'Accepted', tickets: [] },
      { status: 'PREPARING', heading: 'Preparing', tickets: [first, third] },
      { status: 'READY_FOR_PICKUP', heading: 'Ready for pickup', tickets: [fourth] },
    ]);
  });

  it('shows every step even when the queue is empty', () => {
    expect(groupTicketsByStatus([]).map(({ heading, tickets }) => [heading, tickets])).toEqual([
      ['Awaiting acceptance', []],
      ['Accepted', []],
      ['Preparing', []],
      ['Ready for pickup', []],
    ]);
  });
});

describe('formatReadyBy', () => {
  it.each([
    ['2026-10-07T21:15:00.000Z', 'America/Sao_Paulo', '18:15'],
    ['2026-10-07T21:15:00.000Z', 'UTC', '21:15'],
    ['2026-10-08T03:05:59.000Z', 'America/Sao_Paulo', '00:05'],
  ])('shows %s in %s as %s', (readyBy, timeZone, expected) => {
    expect(formatReadyBy(readyBy, timeZone)).toBe(expected);
  });
});
