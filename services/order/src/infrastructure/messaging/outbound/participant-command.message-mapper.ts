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
  type ApproveTicket,
  type CreateTicket,
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
  });
}

export function toAuthorizePayment(order: PlaceOrderSagaOrder): AuthorizePayment {
  return create(AuthorizePaymentSchema, {
    orderId: order.orderId,
    consumerId: order.consumerId,
    amountInCents: order.totalInCents,
    currency: order.currency,
    paymentToken: order.paymentToken,
  });
}

export function toApproveTicket(order: PlaceOrderSagaOrder): ApproveTicket {
  return create(ApproveTicketSchema, { orderId: order.orderId });
}

export function toParticipantCommandMessage(
  command: ParticipantCommand,
  sagaId: string,
): OutboxMessage {
  const { order } = command;
  const routing = { orderId: order.orderId, sagaId };
  switch (command.type) {
    case 'VerifyConsumer':
      return toOutboxMessage(VerifyConsumerSchema, toVerifyConsumer(order), {
        ...routing,
        topic: 'consumer.commands',
      });
    case 'CreateTicket':
      return toOutboxMessage(CreateTicketSchema, toCreateTicket(order), {
        ...routing,
        topic: 'kitchen.commands',
      });
    case 'AuthorizePayment':
      return toOutboxMessage(AuthorizePaymentSchema, toAuthorizePayment(order), {
        ...routing,
        topic: 'accounting.commands',
      });
    case 'ApproveTicket':
      return toOutboxMessage(ApproveTicketSchema, toApproveTicket(order), {
        ...routing,
        topic: 'kitchen.commands',
      });
  }
}
