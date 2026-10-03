import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  PaymentAuthorizedSchema,
  PaymentFailedSchema,
} from '@fd/contracts/fooddelivery/accounting/v1/replies_pb.js';
import { describe, it } from 'vitest';
import { orderId, paymentId } from '../../../../test/support/payment.builder.ts';
import { toPaymentAuthorized, toPaymentFailed } from './accounting-reply.message-mapper.ts';

const directory = goldenSamplesDirectory;
const topic = 'order.place-order-saga.replies';

describe('accounting reply golden samples', () => {
  it('produces the PaymentAuthorized sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: PaymentAuthorizedSchema },
      toPaymentAuthorized({ type: 'PaymentAuthorized', orderId, paymentId }),
    );
  });

  it('produces the PaymentFailed sample', async () => {
    await expectGoldenSample(
      { directory, topic, schema: PaymentFailedSchema },
      toPaymentFailed({ type: 'PaymentFailed', orderId }),
    );
  });
});
