import { fromBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { metadataCausedBy } from '@fd/chassis-outbox';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
  RejectTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import type { Either } from '@fd/domain';
import type { ApproveTicketCommand } from '#application/commands/approve-ticket/approve-ticket.command.ts';
import type { CreateTicketCommand } from '#application/commands/create-ticket/create-ticket.command.ts';
import type { RejectTicketCommand } from '#application/commands/reject-ticket/reject-ticket.command.ts';
import { parseConsumerId } from '#domain/ticket/consumer-id.value-object.ts';
import { parseMenuItemId } from '#domain/ticket/menu-item-id.value-object.ts';
import { parseOrderId, type OrderId } from '#domain/ticket/order-id.value-object.ts';
import { parseRestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';

export type KitchenCommand =
  | { readonly type: 'CreateTicket'; readonly command: CreateTicketCommand }
  | { readonly type: 'ApproveTicket'; readonly command: ApproveTicketCommand }
  | { readonly type: 'RejectTicket'; readonly command: RejectTicketCommand };

function decode<Schema extends DescMessage>(
  schema: Schema,
  message: InboundMessage,
): MessageShape<Schema> {
  try {
    return fromBinary(schema, message.payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${schema.typeName}`, {
      cause: error,
    });
  }
}

function requireOrderId(rawOrderId: string): OrderId {
  const orderId = parseOrderId(rawOrderId);
  if (orderId.isLeft()) {
    throw new PermanentMessageFailure('kitchen command without a valid order id');
  }
  return orderId.success;
}

function requireField<Field>(parsed: Either<unknown, Field>, fieldName: string): Field {
  if (parsed.isLeft())
    throw new PermanentMessageFailure(`CreateTicket without a valid ${fieldName}`);
  return parsed.success;
}

function toCreateTicketCommand(message: InboundMessage, sagaId: string): CreateTicketCommand {
  const createTicket = decode(CreateTicketSchema, message);
  return {
    orderId: requireOrderId(createTicket.orderId),
    restaurantId: requireField(parseRestaurantId(createTicket.restaurantId), 'restaurant id'),
    consumerId: requireField(parseConsumerId(createTicket.consumerId), 'consumer id'),
    lineItems: createTicket.lineItems.map(({ menuItemId, name, quantity }) => ({
      menuItemId: requireField(parseMenuItemId(menuItemId), 'menu item id'),
      name,
      quantity,
    })),
    sagaId,
    metadata: metadataCausedBy(message.headers),
  };
}

function toApproveTicketCommand(message: InboundMessage, sagaId: string): ApproveTicketCommand {
  const approveTicket = decode(ApproveTicketSchema, message);
  return {
    orderId: requireOrderId(approveTicket.orderId),
    sagaId,
    metadata: metadataCausedBy(message.headers),
  };
}

function toRejectTicketCommand(message: InboundMessage, sagaId: string): RejectTicketCommand {
  const rejectTicket = decode(RejectTicketSchema, message);
  return {
    orderId: requireOrderId(rejectTicket.orderId),
    sagaId,
    metadata: metadataCausedBy(message.headers),
  };
}

export function toKitchenCommand(message: InboundMessage): KitchenCommand {
  const { messageType, sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('command without saga-id header');
  switch (messageType) {
    case CreateTicketSchema.typeName:
      return { type: 'CreateTicket', command: toCreateTicketCommand(message, sagaId) };
    case ApproveTicketSchema.typeName:
      return { type: 'ApproveTicket', command: toApproveTicketCommand(message, sagaId) };
    case RejectTicketSchema.typeName:
      return { type: 'RejectTicket', command: toRejectTicketCommand(message, sagaId) };
    default:
      throw new PermanentMessageFailure(`unknown kitchen command ${messageType}`);
  }
}
