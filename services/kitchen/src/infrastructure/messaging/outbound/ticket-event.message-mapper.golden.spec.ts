import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  TicketAcceptedSchema,
  TicketPreparationStartedSchema,
  TicketReadyForPickupSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/events_pb.js';
import { describe, it } from 'vitest';
import {
  acceptedAt,
  orderId,
  readyBy,
  restaurantId,
  ticketId,
} from '../../../../test/support/ticket.builder.ts';
import {
  toTicketAcceptedContract,
  toTicketPreparationStartedContract,
  toTicketReadyForPickupContract,
} from './ticket-event.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'kitchen.ticket.events';
const references = { ticketId, orderId, restaurantId };

describe('ticket event golden samples', () => {
  it('produces the TicketAccepted sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: TicketAcceptedSchema },
      toTicketAcceptedContract({
        eventType: 'TicketAccepted',
        occurredAt: acceptedAt,
        ...references,
        readyBy,
      }),
    );
  });

  it('produces the TicketPreparationStarted sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: TicketPreparationStartedSchema },
      toTicketPreparationStartedContract({
        eventType: 'TicketPreparationStarted',
        occurredAt: new Date('2026-10-06T18:02:00.000Z'),
        ...references,
      }),
    );
  });

  it('produces the TicketReadyForPickup sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: TicketReadyForPickupSchema },
      toTicketReadyForPickupContract({
        eventType: 'TicketReadyForPickup',
        occurredAt: new Date('2026-10-06T18:14:00.000Z'),
        ...references,
      }),
    );
  });
});
