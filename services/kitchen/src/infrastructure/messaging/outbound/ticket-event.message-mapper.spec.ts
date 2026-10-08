import { fromBinary } from '@bufbuild/protobuf';
import { timestampDate, type Timestamp } from '@bufbuild/protobuf/wkt';
import {
  TicketAcceptedSchema,
  TicketPreparationStartedSchema,
  TicketReadyForPickupSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import {
  acceptedAt,
  orderId,
  readyBy,
  restaurantId,
  ticketId,
} from '../../../../test/support/ticket.builder.ts';
import type { TicketEvent } from '#domain/ticket/ticket.aggregate.ts';
import { toTicketEventMessages } from './ticket-event.message-mapper.ts';

const references = { ticketId, orderId, restaurantId };
const startedAt = new Date('2026-10-06T18:02:00.000Z');
const readyAt = new Date('2026-10-06T18:14:00.000Z');

const events: readonly { readonly event: TicketEvent; readonly messageType: string }[] = [
  {
    event: { eventType: 'TicketAccepted', occurredAt: acceptedAt, ...references, readyBy },
    messageType: 'fooddelivery.kitchen.v1.TicketAccepted',
  },
  {
    event: { eventType: 'TicketPreparationStarted', occurredAt: startedAt, ...references },
    messageType: 'fooddelivery.kitchen.v1.TicketPreparationStarted',
  },
  {
    event: { eventType: 'TicketReadyForPickup', occurredAt: readyAt, ...references },
    messageType: 'fooddelivery.kitchen.v1.TicketReadyForPickup',
  },
];

function dateOf(time: Timestamp | undefined): Date | undefined {
  return time === undefined ? undefined : timestampDate(time);
}

function messageOf(event: TicketEvent): Uint8Array {
  const [message] = toTicketEventMessages(event);
  if (message === undefined) throw new Error(`no message for ${event.eventType}`);
  return message.payload;
}

describe('toTicketEventMessages', () => {
  it.each(events)(
    'publishes $event.eventType on kitchen.ticket.events keyed by the ticket id',
    ({ event, messageType }) => {
      expect(toTicketEventMessages(event)).toMatchObject([
        {
          topic: 'kitchen.ticket.events',
          aggregateType: 'Ticket',
          aggregateId: ticketId,
          messageType,
          sagaId: undefined,
        },
      ]);
    },
  );

  it('carries the order, the restaurant and both times of the acceptance', () => {
    const [accepted] = events;
    if (accepted === undefined) throw new Error('expected TicketAccepted');

    const payload = fromBinary(TicketAcceptedSchema, messageOf(accepted.event));

    expect(payload).toMatchObject(references);
    expect([dateOf(payload.acceptedAt), dateOf(payload.readyBy)]).toEqual([acceptedAt, readyBy]);
  });

  it('carries the order, the restaurant and the time of each later step', () => {
    const [, started, ready] = events;
    if (started === undefined || ready === undefined) throw new Error('expected two events');

    const preparation = fromBinary(TicketPreparationStartedSchema, messageOf(started.event));
    const readiness = fromBinary(TicketReadyForPickupSchema, messageOf(ready.event));

    expect([preparation, readiness]).toMatchObject([references, references]);
    expect([dateOf(preparation.startedAt), dateOf(readiness.readyAt)]).toEqual([
      startedAt,
      readyAt,
    ]);
  });
});
