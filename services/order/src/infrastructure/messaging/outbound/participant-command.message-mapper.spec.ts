import { fromBinary } from '@bufbuild/protobuf';
import { AuthorizePaymentSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import {
  buildSagaOrder,
  sagaPaymentToken,
} from '../../../../test/support/place-order-saga.builder.ts';
import type { ParticipantCommand } from '#application/sagas/place-order/place-order.saga.ts';
import {
  toAuthorizePayment,
  toParticipantCommandMessage,
} from './participant-command.message-mapper.ts';

const order = buildSagaOrder();
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';

describe('toParticipantCommandMessage', () => {
  it.each<{
    readonly command: ParticipantCommand;
    readonly topic: string;
    readonly messageType: string;
  }>([
    {
      command: { type: 'VerifyConsumer', order },
      topic: 'consumer.commands',
      messageType: 'fooddelivery.consumer.v1.VerifyConsumer',
    },
    {
      command: { type: 'CreateTicket', order },
      topic: 'kitchen.commands',
      messageType: 'fooddelivery.kitchen.v1.CreateTicket',
    },
    {
      command: { type: 'AuthorizePayment', order, paymentToken: sagaPaymentToken },
      topic: 'accounting.commands',
      messageType: 'fooddelivery.accounting.v1.AuthorizePayment',
    },
    {
      command: { type: 'ApproveTicket', order },
      topic: 'kitchen.commands',
      messageType: 'fooddelivery.kitchen.v1.ApproveTicket',
    },
  ])('sends $command.type to $topic keyed by the order id', ({ command, topic, messageType }) => {
    const message = toParticipantCommandMessage(command, sagaId);

    expect(message).toMatchObject({
      topic,
      aggregateType: 'Order',
      aggregateId: order.orderId,
      messageType,
      sagaId,
    });
  });

  it('carries the Protobuf payload of the command with the payment token', () => {
    const message = toParticipantCommandMessage(
      { type: 'AuthorizePayment', order, paymentToken: sagaPaymentToken },
      sagaId,
    );

    expect(fromBinary(AuthorizePaymentSchema, message.payload)).toEqual(
      toAuthorizePayment(order, sagaPaymentToken),
    );
    expect(fromBinary(AuthorizePaymentSchema, message.payload).paymentToken).toBe('tok_visa_4242');
  });
});
