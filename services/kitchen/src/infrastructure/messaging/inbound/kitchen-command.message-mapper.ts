import { fromBinary, type DescMessage, type MessageShape } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import { metadataCausedBy } from '@fd/chassis-outbox';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import { isUuid } from '@fd/domain';
import type { ApproveTicketCommand } from '#application/commands/approve-ticket/approve-ticket.command.ts';
import type { CreateTicketCommand } from '#application/commands/create-ticket/create-ticket.command.ts';
import { parseOrderId, type OrderId } from '#domain/ticket/order-id.value-object.ts';

export type KitchenCommand =
  | { readonly type: 'CreateTicket'; readonly command: CreateTicketCommand }
  | { readonly type: 'ApproveTicket'; readonly command: ApproveTicketCommand };

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

function requireUuid(rawId: string, field: string): string {
  if (!isUuid(rawId)) throw new PermanentMessageFailure(`CreateTicket without a valid ${field}`);
  return rawId.toLowerCase();
}

function toCreateTicketCommand(message: InboundMessage, sagaId: string): CreateTicketCommand {
  const createTicket = decode(CreateTicketSchema, message);
  return {
    orderId: requireOrderId(createTicket.orderId),
    restaurantId: requireUuid(createTicket.restaurantId, 'restaurant id'),
    lineItems: createTicket.lineItems.map(({ menuItemId, name, quantity }) => ({
      menuItemId: requireUuid(menuItemId, 'menu item id'),
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

export function toKitchenCommand(message: InboundMessage): KitchenCommand {
  const { messageType, sagaId } = message.headers;
  if (sagaId === undefined) throw new PermanentMessageFailure('command without saga-id header');
  switch (messageType) {
    case CreateTicketSchema.typeName:
      return { type: 'CreateTicket', command: toCreateTicketCommand(message, sagaId) };
    case ApproveTicketSchema.typeName:
      return { type: 'ApproveTicket', command: toApproveTicketCommand(message, sagaId) };
    default:
      throw new PermanentMessageFailure(`unknown kitchen command ${messageType}`);
  }
}
