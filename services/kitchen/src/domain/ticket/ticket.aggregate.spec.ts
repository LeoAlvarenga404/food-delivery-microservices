import { left, right, type Either } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  acceptedAt,
  buildTicket,
  buildTicketIn,
  createTicketInput,
  fifteenMinutes,
  margheritaId,
  orderId,
  readyBy,
  restaurantId,
  ticketId,
} from '../../../test/support/ticket.builder.ts';
import { Ticket } from './ticket.aggregate.ts';
import type { InvalidTicketTransition } from './ticket.errors.ts';
import type { TicketState, TicketStatus } from './ticket.state.ts';

const startedAt = new Date('2026-10-06T18:02:00.000Z');
const readyAt = new Date('2026-10-06T18:14:00.000Z');
const acceptance = { acceptedAt, readyBy };

const statesByStatus: Readonly<Record<TicketStatus, TicketState>> = {
  CREATE_PENDING: { status: 'CREATE_PENDING' },
  AWAITING_ACCEPTANCE: { status: 'AWAITING_ACCEPTANCE' },
  REJECTED: { status: 'REJECTED' },
  ACCEPTED: { status: 'ACCEPTED', ...acceptance },
  PREPARING: { status: 'PREPARING', ...acceptance },
  READY_FOR_PICKUP: { status: 'READY_FOR_PICKUP', ...acceptance },
};

interface Transition {
  readonly to: TicketStatus;
  readonly apply: (ticket: Ticket) => Either<InvalidTicketTransition, undefined>;
}

const transitions: Readonly<Record<string, Transition>> = {
  approve: { to: 'AWAITING_ACCEPTANCE', apply: (ticket) => ticket.approve() },
  reject: { to: 'REJECTED', apply: (ticket) => ticket.reject() },
  accept: { to: 'ACCEPTED', apply: (ticket) => ticket.accept(fifteenMinutes, acceptedAt) },
  startPreparing: { to: 'PREPARING', apply: (ticket) => ticket.startPreparing(startedAt) },
  markReady: { to: 'READY_FOR_PICKUP', apply: (ticket) => ticket.markReady(readyAt) },
};

const allowedPairs = new Set([
  'CREATE_PENDING approve',
  'CREATE_PENDING reject',
  'AWAITING_ACCEPTANCE accept',
  'ACCEPTED startPreparing',
  'PREPARING markReady',
]);

const refusedPairs = Object.values(statesByStatus).flatMap((state) =>
  Object.keys(transitions)
    .filter((transitionName) => !allowedPairs.has(`${state.status} ${transitionName}`))
    .map((transitionName) => ({ from: state.status, transitionName })),
);

function transitionNamed(transitionName: string): Transition {
  const transition = transitions[transitionName];
  if (transition === undefined) throw new Error(`no transition ${transitionName}`);
  return transition;
}

describe('Ticket.create', () => {
  it('creates a ticket that waits for the saga to approve it', () => {
    expect(buildTicket().toSnapshot()).toEqual({
      ...createTicketInput(),
      state: { status: 'CREATE_PENDING' },
      version: 0,
    });
  });

  it('refuses a ticket without line items', () => {
    expect(Ticket.create(createTicketInput({ lineItems: [] }))).toEqual(
      left({ type: 'EmptyTicket', orderId }),
    );
  });

  it.each([0, -1, 1.5])('refuses a line item with quantity %s', (quantity) => {
    const lineItem = { menuItemId: margheritaId, name: 'Pizza', quantity };

    expect(Ticket.create(createTicketInput({ lineItems: [lineItem] }))).toEqual(
      left({ type: 'InvalidQuantity', menuItemId: margheritaId, quantity }),
    );
  });

  it('refuses a ticket whose later line item has an invalid quantity', () => {
    const [validLineItem, laterLineItem] = createTicketInput().lineItems;
    if (validLineItem === undefined || laterLineItem === undefined) throw new Error('two items');
    const lineItems = [validLineItem, { ...laterLineItem, quantity: 0 }];

    expect(Ticket.create(createTicketInput({ lineItems }))).toEqual(
      left({ type: 'InvalidQuantity', menuItemId: laterLineItem.menuItemId, quantity: 0 }),
    );
  });
});

describe('Ticket transitions', () => {
  it('moves a pending ticket to awaiting acceptance once the saga approves it', () => {
    const ticket = buildTicket();

    expect(ticket.approve()).toEqual(right(undefined));
    expect(ticket.toSnapshot().state).toEqual({ status: 'AWAITING_ACCEPTANCE' });
    expect(ticket.pullRecordedEvents()).toEqual([]);
  });

  it('rejects a pending ticket', () => {
    const ticket = buildTicket();

    expect(ticket.reject()).toEqual(right(undefined));
    expect(ticket.toSnapshot().state).toEqual({ status: 'REJECTED' });
    expect(ticket.pullRecordedEvents()).toEqual([]);
  });

  it('accepts a ticket ready by the acceptance time plus the preparation time', () => {
    const ticket = buildTicketIn(statesByStatus.AWAITING_ACCEPTANCE);

    expect(ticket.accept(fifteenMinutes, acceptedAt)).toEqual(right(undefined));
    expect(ticket.toSnapshot().state).toEqual({ status: 'ACCEPTED', acceptedAt, readyBy });
    expect(ticket.pullRecordedEvents()).toEqual([
      {
        eventType: 'TicketAccepted',
        occurredAt: acceptedAt,
        ticketId,
        orderId,
        restaurantId,
        readyBy,
      },
    ]);
  });

  it('starts preparing an accepted ticket and keeps its ready-by time', () => {
    const ticket = buildTicketIn(statesByStatus.ACCEPTED);

    expect(ticket.startPreparing(startedAt)).toEqual(right(undefined));
    expect(ticket.toSnapshot().state).toEqual({ status: 'PREPARING', ...acceptance });
    expect(ticket.pullRecordedEvents()).toEqual([
      {
        eventType: 'TicketPreparationStarted',
        occurredAt: startedAt,
        ticketId,
        orderId,
        restaurantId,
      },
    ]);
  });

  it('marks a ticket in preparation ready for pickup and keeps its ready-by time', () => {
    const ticket = buildTicketIn(statesByStatus.PREPARING);

    expect(ticket.markReady(readyAt)).toEqual(right(undefined));
    expect(ticket.toSnapshot().state).toEqual({ status: 'READY_FOR_PICKUP', ...acceptance });
    expect(ticket.pullRecordedEvents()).toEqual([
      { eventType: 'TicketReadyForPickup', occurredAt: readyAt, ticketId, orderId, restaurantId },
    ]);
  });

  it('refuses every other pair: 25 of the 30 states and transitions', () => {
    expect(refusedPairs).toHaveLength(25);
  });

  it.each(refusedPairs)(
    'refuses $transitionName from $from, keeping its state and recording nothing',
    ({ from, transitionName }) => {
      const ticket = buildTicketIn(statesByStatus[from]);
      const transition = transitionNamed(transitionName);

      expect(transition.apply(ticket)).toEqual(
        left({ type: 'InvalidTicketTransition', ticketId, from, to: transition.to }),
      );
      expect(ticket.toSnapshot().state).toEqual(statesByStatus[from]);
      expect(ticket.pullRecordedEvents()).toEqual([]);
    },
  );

  it('restores an accepted ticket without recording anything', () => {
    const snapshot = { ...createTicketInput(), state: statesByStatus.ACCEPTED, version: 3 };

    const restored = Ticket.restore(snapshot);

    expect(restored.toSnapshot()).toEqual(snapshot);
    expect(restored.pullRecordedEvents()).toEqual([]);
    expect(restored.startPreparing(startedAt)).toEqual(right(undefined));
  });
});
