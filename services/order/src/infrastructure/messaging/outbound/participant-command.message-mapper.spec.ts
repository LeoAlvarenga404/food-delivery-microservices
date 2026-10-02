import { fromBinary } from '@bufbuild/protobuf';
import { AuthorizePaymentSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildSagaOrder } from '../../../../test/support/place-order-saga.builder.ts';
import type { ParticipantCommandType } from '#application/sagas/place-order/place-order.saga.ts';
import {
  toAuthorizePayment,
  toParticipantCommandMessage,
} from './participant-command.message-mapper.ts';

const order = buildSagaOrder();
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';

describe('toParticipantCommandMessage', () => {
  it.each<{
    readonly type: ParticipantCommandType;
    readonly topic: string;
    readonly messageType: string;
  }>([
    {
      type: 'VerifyConsumer',
      topic: 'consumer.commands',
      messageType: 'fooddelivery.consumer.v1.VerifyConsumer',
    },
    {
      type: 'CreateTicket',
      topic: 'kitchen.commands',
      messageType: 'fooddelivery.kitchen.v1.CreateTicket',
    },
    {
      type: 'AuthorizePayment',
      topic: 'accounting.commands',
      messageType: 'fooddelivery.accounting.v1.AuthorizePayment',
    },
    {
      type: 'ApproveTicket',
      topic: 'kitchen.commands',
      messageType: 'fooddelivery.kitchen.v1.ApproveTicket',
    },
  ])('sends $type to $topic keyed by the order id', ({ type, topic, messageType }) => {
    const message = toParticipantCommandMessage({ type, order }, sagaId);

    expect(message).toMatchObject({
      topic,
      aggregateType: 'Order',
      aggregateId: order.orderId,
      messageType,
      sagaId,
    });
  });

  it('carries the Protobuf payload of the command', () => {
    const message = toParticipantCommandMessage({ type: 'AuthorizePayment', order }, sagaId);

    expect(fromBinary(AuthorizePaymentSchema, message.payload)).toEqual(toAuthorizePayment(order));
  });
});
