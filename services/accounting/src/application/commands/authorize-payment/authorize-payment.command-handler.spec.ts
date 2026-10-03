import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { FakePaymentGateway } from '../../../../test/support/payment-gateway.fake.ts';
import {
  authorizePaymentInput,
  orderId,
  paymentId,
} from '../../../../test/support/payment.builder.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';
import type { AuthorizePaymentCommand } from './authorize-payment.command.ts';
import { AuthorizePaymentCommandHandler } from './authorize-payment.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const { consumerId, amountInCents, currency, authorizedAt } = authorizePaymentInput();
const command: AuthorizePaymentCommand = {
  orderId,
  consumerId,
  amountInCents,
  currency,
  paymentToken: 'tok_visa_4242',
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d03',
    traceparent: undefined,
    actorId: undefined,
    actorType: undefined,
  },
};
const idGenerator: IdGenerator = { generatePaymentId: () => paymentId };
const clock: Clock = { now: () => authorizedAt };

function authorizePayment(
  unitOfWork: InMemoryUnitOfWork,
  paymentGateway: FakePaymentGateway,
): AuthorizePaymentCommandHandler {
  return new AuthorizePaymentCommandHandler({ unitOfWork, paymentGateway, idGenerator, clock });
}

describe('AuthorizePaymentCommandHandler', () => {
  it('authorizes the amount once per saga step, records the payment and replies PaymentAuthorized', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const paymentGateway = new FakePaymentGateway();
    const reply: AccountingReply = { type: 'PaymentAuthorized', orderId, paymentId };

    const outcome = await authorizePayment(unitOfWork, paymentGateway).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(paymentGateway.requests).toEqual([
      {
        idempotencyKey: `${sagaId}:AuthorizePayment`,
        amountInCents,
        currency,
        paymentToken: 'tok_visa_4242',
      },
    ]);
    expect((await unitOfWork.payments.findByOrderId(orderId))?.toSnapshot()).toEqual({
      ...authorizePaymentInput(),
      status: 'AUTHORIZED',
      version: 1,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('records nothing and sends no reply when the gateway declines the card', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await authorizePayment(unitOfWork, new FakePaymentGateway(true)).execute(
      command,
    );

    expect(outcome).toEqual(
      left({ type: 'PaymentDeclined', idempotencyKey: `${sagaId}:AuthorizePayment` }),
    );
    expect(unitOfWork.payments.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
