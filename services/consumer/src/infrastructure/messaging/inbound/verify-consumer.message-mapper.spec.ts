import { PermanentMessageFailure } from '@fd/chassis-kafka';
import { VerifyConsumerSchema } from '@fd/contracts/fooddelivery/consumer/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { activeConsumerId } from '../../../../test/support/consumer.builder.ts';
import { toVerifyConsumerCommand } from './verify-consumer.message-mapper.ts';

const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const verifyConsumer = { consumerId: activeConsumerId, orderId };

describe('toVerifyConsumerCommand', () => {
  it('reads the command and chains its replies to the command message', () => {
    const message = buildCommandMessage(VerifyConsumerSchema, verifyConsumer);

    expect(toVerifyConsumerCommand(message)).toEqual({
      consumerId: activeConsumerId,
      orderId,
      sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
      metadata: {
        correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
        causationId: message.headers.messageId,
        actorId: undefined,
        actorType: undefined,
      },
    });
  });

  it('reads uppercase ids in their canonical lowercase form', () => {
    const message = buildCommandMessage(VerifyConsumerSchema, {
      consumerId: activeConsumerId.toUpperCase(),
      orderId: orderId.toUpperCase(),
    });

    expect(toVerifyConsumerCommand(message)).toMatchObject({
      consumerId: activeConsumerId,
      orderId,
    });
  });

  it.each([
    {
      problem: 'a message type the service does not handle',
      message: buildCommandMessage(VerifyConsumerSchema, verifyConsumer, {
        messageType: 'fooddelivery.consumer.v1.RegisterConsumer',
      }),
    },
    {
      problem: 'a command without saga id',
      message: buildCommandMessage(VerifyConsumerSchema, verifyConsumer, { sagaId: undefined }),
    },
    {
      problem: 'a payload that does not decode',
      message: {
        ...buildCommandMessage(VerifyConsumerSchema, verifyConsumer),
        payload: new Uint8Array([0xff, 0xff, 0xff]),
      },
    },
    {
      problem: 'a consumer id that is not a uuid',
      message: buildCommandMessage(VerifyConsumerSchema, { ...verifyConsumer, consumerId: 'ana' }),
    },
    {
      problem: 'an order id that is not a uuid',
      message: buildCommandMessage(VerifyConsumerSchema, { ...verifyConsumer, orderId: '' }),
    },
  ])('treats $problem as a permanent failure', ({ message }) => {
    expect(() => toVerifyConsumerCommand(message)).toThrow(PermanentMessageFailure);
  });
});
