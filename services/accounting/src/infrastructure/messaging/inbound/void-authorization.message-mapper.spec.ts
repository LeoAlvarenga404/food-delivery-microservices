import { PermanentMessageFailure } from '@fd/chassis-kafka';
import { VoidAuthorizationSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { orderId } from '../../../../test/support/payment.builder.ts';
import { toVoidAuthorizationCommand } from './void-authorization.message-mapper.ts';

describe('toVoidAuthorizationCommand', () => {
  it('reads the order to void and chains the reply to the command message', () => {
    const message = buildCommandMessage(VoidAuthorizationSchema, { orderId });

    expect(toVoidAuthorizationCommand(message)).toEqual({
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

  it('reads an uppercase order id in its canonical lowercase form', () => {
    const message = buildCommandMessage(VoidAuthorizationSchema, {
      orderId: orderId.toUpperCase(),
    });

    expect(toVoidAuthorizationCommand(message).orderId).toBe(orderId);
  });

  it.each([
    {
      problem: 'a command without saga id',
      message: buildCommandMessage(VoidAuthorizationSchema, { orderId }, { sagaId: undefined }),
    },
    {
      problem: 'a payload that does not decode',
      message: {
        ...buildCommandMessage(VoidAuthorizationSchema, { orderId }),
        payload: new Uint8Array([0xff, 0xff, 0xff]),
      },
    },
    {
      problem: 'an order id that is not a uuid',
      message: buildCommandMessage(VoidAuthorizationSchema, { orderId: 'order-1' }),
    },
  ])('treats $problem as a permanent failure', ({ message }) => {
    expect(() => toVoidAuthorizationCommand(message)).toThrow(PermanentMessageFailure);
  });
});
