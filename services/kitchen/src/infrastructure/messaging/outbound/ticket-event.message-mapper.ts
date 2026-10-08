import { create, toBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  TicketAcceptedSchema,
  TicketPreparationStartedSchema,
  TicketReadyForPickupSchema,
  type TicketAccepted as TicketAcceptedContract,
  type TicketPreparationStarted as TicketPreparationStartedContract,
  type TicketReadyForPickup as TicketReadyForPickupContract,
} from '@fd/contracts/fooddelivery/kitchen/v1/events_pb.js';
import type { TicketAccepted } from '#domain/ticket/ticket-accepted.event.ts';
import type { TicketPreparationStarted } from '#domain/ticket/ticket-preparation-started.event.ts';
import type { TicketReadyForPickup } from '#domain/ticket/ticket-ready-for-pickup.event.ts';
import type { TicketEvent } from '#domain/ticket/ticket.aggregate.ts';

const ticketEventsTopic = 'kitchen.ticket.events';

export function toTicketAcceptedContract(event: TicketAccepted): TicketAcceptedContract {
  return create(TicketAcceptedSchema, {
    ticketId: event.ticketId,
    orderId: event.orderId,
    restaurantId: event.restaurantId,
    acceptedAt: timestampFromDate(event.occurredAt),
    readyBy: timestampFromDate(event.readyBy),
  });
}

export function toTicketPreparationStartedContract(
  event: TicketPreparationStarted,
): TicketPreparationStartedContract {
  return create(TicketPreparationStartedSchema, {
    ticketId: event.ticketId,
    orderId: event.orderId,
    restaurantId: event.restaurantId,
    startedAt: timestampFromDate(event.occurredAt),
  });
}

export function toTicketReadyForPickupContract(
  event: TicketReadyForPickup,
): TicketReadyForPickupContract {
  return create(TicketReadyForPickupSchema, {
    ticketId: event.ticketId,
    orderId: event.orderId,
    restaurantId: event.restaurantId,
    readyAt: timestampFromDate(event.occurredAt),
  });
}

function toEventMessage<Schema extends DescMessage>(
  schema: Schema,
  payload: MessageShape<Schema>,
  event: TicketEvent,
): OutboxMessage {
  return {
    topic: ticketEventsTopic,
    aggregateType: 'Ticket',
    aggregateId: event.ticketId,
    messageType: schema.typeName,
    payload: toBinary(schema, payload),
    sagaId: undefined,
  };
}

export function toTicketEventMessages(event: TicketEvent): readonly OutboxMessage[] {
  switch (event.eventType) {
    case 'TicketAccepted':
      return [toEventMessage(TicketAcceptedSchema, toTicketAcceptedContract(event), event)];
    case 'TicketPreparationStarted':
      return [
        toEventMessage(
          TicketPreparationStartedSchema,
          toTicketPreparationStartedContract(event),
          event,
        ),
      ];
    case 'TicketReadyForPickup':
      return [
        toEventMessage(TicketReadyForPickupSchema, toTicketReadyForPickupContract(event), event),
      ];
  }
}
