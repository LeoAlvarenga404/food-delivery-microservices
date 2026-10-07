import { create } from '@bufbuild/protobuf';
import type { OutboxMessage } from '@fd/chassis-outbox';
import {
  AuthorizePaymentSchema,
  type AuthorizePayment,
} from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import {
  VerifyConsumerSchema,
  type VerifyConsumer,
} from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import {
  ApproveTicketSchema,
  CreateTicketSchema,
  RejectTicketSchema,
  type ApproveTicket,
  type CreateTicket,
  type RejectTicket,
} from '@fd/contracts/fooddelivery/kitchen/v1/commands_pb.js';
import type { ParticipantCommand } from '#application/sagas/place-order/place-order.saga.ts';
import type { PlaceOrderSagaOrder } from '#application/sagas/place-order/place-order.saga-state.ts';
import { toOutboxMessage } from './outbox-message.message-mapper.ts';

export function toVerifyConsumer(order: PlaceOrderSagaOrder): VerifyConsumer {
  return create(VerifyConsumerSchema, { consumerId: order.consumerId, orderId: order.orderId });
}

export function toCreateTicket(order: PlaceOrderSagaOrder): CreateTicket {
  return create(CreateTicketSchema, {
    orderId: order.orderId,
    restaurantId: order.restaurantId,
    lineItems: order.lineItems.map(({ menuItemId, name, quantity }) => ({
      menuItemId,
      name,
      quantity,
    })),
    consumerId: order.consumerId,
  });
}

export function toAuthorizePayment(
  order: PlaceOrderSagaOrder,
  paymentToken: string,
): AuthorizePayment {
  return create(AuthorizePaymentSchema, {
    orderId: order.orderId,
    consumerId: order.consumerId,
    amountInCents: order.totalInCents,
    currency: order.currency,
    paymentToken,
    restaurantId: order.restaurantId,
    deliveryFeeInCents: order.deliveryFeeInCents,
  });
}

export function toApproveTicket(order: PlaceOrderSagaOrder): ApproveTicket {
  return create(ApproveTicketSchema, { orderId: order.orderId });
}

export function toRejectTicket(order: PlaceOrderSagaOrder): RejectTicket {
  return create(RejectTicketSchema, { orderId: order.orderId });
}

function commandTopicOf(commandType: ParticipantCommand['type']): string {
  switch (commandType) {
    case 'VerifyConsumer':
      return 'consumer.commands';
    case 'AuthorizePayment':
      return 'accounting.commands';
    case 'CreateTicket':
    case 'ApproveTicket':
    case 'RejectTicket':
      return 'kitchen.commands';
  }
}

export function toParticipantCommandMessage(
  command: ParticipantCommand,
  sagaId: string,
): OutboxMessage {
  const { order } = command;
  const routing = { topic: commandTopicOf(command.type), orderId: order.orderId, sagaId };
  switch (command.type) {
    case 'VerifyConsumer':
      return toOutboxMessage(VerifyConsumerSchema, toVerifyConsumer(order), routing);
    case 'CreateTicket':
      return toOutboxMessage(CreateTicketSchema, toCreateTicket(order), routing);
    case 'AuthorizePayment':
      return toOutboxMessage(
        AuthorizePaymentSchema,
        toAuthorizePayment(order, command.paymentToken),
        routing,
      );
    case 'ApproveTicket':
      return toOutboxMessage(ApproveTicketSchema, toApproveTicket(order), routing);
    case 'RejectTicket':
      return toOutboxMessage(RejectTicketSchema, toRejectTicket(order), routing);
  }
}
