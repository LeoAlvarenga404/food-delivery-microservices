import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { AuthorizePaymentSchema } from '@fd/contracts/fooddelivery/accounting/v1/commands_pb.js';
import { describe, expect, it } from 'vitest';
import { buildCommandMessage } from '../../../../test/support/command-message.builder.ts';
import { toAuthorizePaymentCommand } from './authorize-payment.message-mapper.ts';

describe('accounting command golden samples', () => {
  it('reads the AuthorizePayment sample the Order service produces', async () => {
    const sample = await readGoldenSample({
      directory: goldenSamplesDirectory,
      topic: 'accounting.commands',
      schema: AuthorizePaymentSchema,
    });

    const { orderId, consumerId, amountInCents, currency, paymentToken } =
      toAuthorizePaymentCommand(buildCommandMessage(AuthorizePaymentSchema, sample));

    expect({ orderId, consumerId, amountInCents, currency, paymentToken }).toEqual({
      orderId: '0199a5d0-0000-7000-8000-0000000000a1',
      consumerId: '0199a5d0-0000-7000-8000-0000000000c1',
      amountInCents: 9800n,
      currency: 'BRL',
      paymentToken: 'tok_visa_4242',
    });
  });
});
