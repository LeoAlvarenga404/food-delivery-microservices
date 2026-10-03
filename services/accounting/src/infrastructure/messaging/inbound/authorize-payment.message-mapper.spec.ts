import { PermanentMessageFailure } from '@fd/chassis-kafka';
import { AuthorizePaymentSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { authorizePaymentInput, orderId } from '../../../../test/support/payment.builder.ts';
import { toAuthorizePaymentCommand } from './authorize-payment.message-mapper.ts';

const { consumerId } = authorizePaymentInput();
const authorizePayment = {
  orderId,
  consumerId,
  amountInCents: 9800n,
  currency: 'BRL',
  paymentToken: 'tok_visa_4242',
};

describe('toAuthorizePaymentCommand', () => {
  it('reads the command and chains its replies to the command message', () => {
    const message = buildCommandMessage(AuthorizePaymentSchema, authorizePayment);

    expect(toAuthorizePaymentCommand(message)).toEqual({
      ...authorizePayment,
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
    const message = buildCommandMessage(AuthorizePaymentSchema, {
      ...authorizePayment,
      orderId: orderId.toUpperCase(),
      consumerId: consumerId.toUpperCase(),
    });

    expect(toAuthorizePaymentCommand(message)).toMatchObject({ orderId, consumerId });
  });

  it.each([
    {
      problem: 'a message type accounting does not handle',
      message: buildCommandMessage(AuthorizePaymentSchema, authorizePayment, {
        messageType: 'fooddelivery.accounting.v1.CapturePayment',
      }),
    },
    {
      problem: 'a command without saga id',
      message: buildCommandMessage(AuthorizePaymentSchema, authorizePayment, {
        sagaId: undefined,
      }),
    },
    {
      problem: 'a payload that does not decode',
      message: {
        ...buildCommandMessage(AuthorizePaymentSchema, authorizePayment),
        payload: new Uint8Array([0xff, 0xff, 0xff]),
      },
    },
    {
      problem: 'an order id that is not a uuid',
      message: buildCommandMessage(AuthorizePaymentSchema, { ...authorizePayment, orderId: '' }),
    },
    {
      problem: 'a consumer id that is not a uuid',
      message: buildCommandMessage(AuthorizePaymentSchema, {
        ...authorizePayment,
        consumerId: 'ana',
      }),
    },
    {
      problem: 'an amount that is not positive',
      message: buildCommandMessage(AuthorizePaymentSchema, {
        ...authorizePayment,
        amountInCents: 0n,
      }),
    },
    {
      problem: 'a negative amount',
      message: buildCommandMessage(AuthorizePaymentSchema, {
        ...authorizePayment,
        amountInCents: -1n,
      }),
    },
    {
      problem: 'a currency other than BRL',
      message: buildCommandMessage(AuthorizePaymentSchema, {
        ...authorizePayment,
        currency: 'USD',
      }),
    },
    {
      problem: 'a missing payment token',
      message: buildCommandMessage(AuthorizePaymentSchema, {
        ...authorizePayment,
        paymentToken: '',
      }),
    },
  ])('treats $problem as a permanent failure', ({ message }) => {
    expect(() => toAuthorizePaymentCommand(message)).toThrow(PermanentMessageFailure);
  });
});
