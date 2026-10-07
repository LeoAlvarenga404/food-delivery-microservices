import { right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { FakePaymentGateway } from '../../../../test/support/payment-gateway.fake.ts';
import {
  authorizePaymentInput,
  buildPayment,
  gatewayVoidId,
  orderId,
  paymentId,
  unwrap,
} from '../../../../test/support/payment.builder.ts';
import { parsePaymentId } from '#domain/payment/payment-id.value-object.ts';
import type { PaymentGateway } from '#application/ports/payment-gateway.port.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';
import type { AuthorizePaymentCommand } from './authorize-payment.command.ts';
import { AuthorizePaymentCommandHandler } from './authorize-payment.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const { consumerId, restaurantId, amount, deliveryFee, authorizedAt } = authorizePaymentInput();
const command: AuthorizePaymentCommand = {
  orderId,
  consumerId,
  restaurantId,
  amount,
  deliveryFee,
  paymentToken: 'tok_visa_4242',
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d03',
    actorId: undefined,
    actorType: undefined,
  },
};
const idGenerator: IdGenerator = { generatePaymentId: () => paymentId };
const clock: Clock = { now: () => authorizedAt };

function authorizePayment(
  unitOfWork: InMemoryUnitOfWork,
  paymentGateway: PaymentGateway,
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
        amount,
        paymentToken: 'tok_visa_4242',
      },
    ]);
    expect((await unitOfWork.payments.findByOrderId(orderId))?.toSnapshot()).toEqual({
      ...authorizePaymentInput(),
      state: { status: 'AUTHORIZED' },
      version: 1,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('treats an authorization the gateway answered without a reference as a bug and records nothing', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const blankReferenceGateway: PaymentGateway = {
      authorize: () => Promise.resolve(right({ authorizationId: ' ' })),
      void: () => Promise.resolve({ voidId: 'void-1' }),
    };

    const execution = authorizePayment(unitOfWork, blankReferenceGateway).execute(command);

    await expect(execution).rejects.toThrow('without a reference');
    expect(unitOfWork.payments.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });

  it('records nothing and replies PaymentFailed when the gateway declines the card', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const reply: AccountingReply = { type: 'PaymentFailed', orderId };

    const outcome = await authorizePayment(unitOfWork, new FakePaymentGateway(true)).execute(
      command,
    );

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.payments.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it('answers a repeated AuthorizePayment with the payment it already recorded, without charging again', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const recordedPaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000ea'));
    await unitOfWork.payments.save(buildPayment({ paymentId: recordedPaymentId }));
    const paymentGateway = new FakePaymentGateway();
    const reply: AccountingReply = {
      type: 'PaymentAuthorized',
      orderId,
      paymentId: recordedPaymentId,
    };

    const outcome = await authorizePayment(unitOfWork, paymentGateway).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(paymentGateway.requests).toEqual([]);
    expect(unitOfWork.payments.rows.size).toBe(1);
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it('answers a redriven AuthorizePayment for a voided payment with PaymentAuthorized, without charging again', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const recordedPaymentId = unwrap(parsePaymentId('0199a5d0-0000-7000-8000-0000000000ea'));
    const voided = buildPayment({ paymentId: recordedPaymentId });
    unwrap(voided.void({ voidedAt: new Date('2026-10-02T12:01:30.000Z'), gatewayVoidId }));
    await unitOfWork.payments.save(voided);
    const paymentGateway = new FakePaymentGateway();
    const reply: AccountingReply = {
      type: 'PaymentAuthorized',
      orderId,
      paymentId: recordedPaymentId,
    };

    const outcome = await authorizePayment(unitOfWork, paymentGateway).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(paymentGateway.requests).toEqual([]);
    expect((await unitOfWork.payments.findByOrderId(orderId))?.toSnapshot().state.status).toBe(
      'VOIDED',
    );
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });
});
