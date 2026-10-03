import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  buildTicket,
  createTicketInput,
  orderId,
  ticketId,
  unwrap,
} from '../../../test/support/ticket.builder.ts';
import { Ticket } from './ticket.aggregate.ts';

describe('Ticket', () => {
  it('creates a ticket that waits for the saga to approve it', () => {
    expect(buildTicket().toSnapshot()).toEqual({
      ...createTicketInput(),
      status: 'CREATE_PENDING',
      version: 0,
    });
  });

  it('refuses a ticket without line items', () => {
    expect(Ticket.create(createTicketInput({ lineItems: [] }))).toEqual(
      left({ type: 'EmptyTicket', orderId }),
    );
  });

  it.each([0, -1, 1.5])('refuses a line item with quantity %s', (quantity) => {
    const lineItem = {
      menuItemId: '0199a5d0-0000-7000-8000-000000000101',
      name: 'Pizza',
      quantity,
    };

    expect(Ticket.create(createTicketInput({ lineItems: [lineItem] }))).toEqual(
      left({ type: 'InvalidQuantity', menuItemId: lineItem.menuItemId, quantity }),
    );
  });

  it('moves to awaiting acceptance once the saga approves it', () => {
    const ticket = buildTicket();

    expect(ticket.approve()).toEqual(right(undefined));
    expect(ticket.toSnapshot().status).toBe('AWAITING_ACCEPTANCE');
  });

  it('refuses a second approval and keeps its state', () => {
    const ticket = buildTicket();
    unwrap(ticket.approve());

    expect(ticket.approve()).toEqual(
      left({
        type: 'InvalidTicketTransition',
        ticketId,
        from: 'AWAITING_ACCEPTANCE',
        to: 'AWAITING_ACCEPTANCE',
      }),
    );
    expect(ticket.toSnapshot().status).toBe('AWAITING_ACCEPTANCE');
  });

  it('restores an approved ticket that cannot be approved again', () => {
    const approved = buildTicket();
    unwrap(approved.approve());

    const restored = Ticket.restore({ ...approved.toSnapshot(), version: 2 });

    expect(restored.toSnapshot()).toEqual({ ...approved.toSnapshot(), version: 2 });
    expect(restored.approve().isLeft()).toBe(true);
  });
});
