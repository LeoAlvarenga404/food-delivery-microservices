import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { FakePaymentGateway } from '../../../../test/support/payment-gateway.fake.ts';
import {
  authorizePaymentInput,
  buildPayment,
  gatewayVoidId,
  orderId,
  unwrap,
} from '../../../../test/support/payment.builder.ts';
import type { Clock } from '#application/ports/clock.port.ts';
import type { PaymentGateway } from '#application/ports/payment-gateway.port.ts';
import type { AccountingReply } from '#application/ports/reply-sender.port.ts';
import type { VoidAuthorizationCommand } from './void-authorization.command.ts';
import { VoidAuthorizationCommandHandler } from './void-authorization.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const voidedAt = new Date('2026-10-02T12:01:30.000Z');
const clock: Clock = { now: () => voidedAt };
const reply: AccountingReply = { type: 'AuthorizationVoided', orderId };
const command: VoidAuthorizationCommand = {
  orderId,
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d07',
    actorId: undefined,
    actorType: undefined,
  },
};

function voidAuthorization(
  unitOfWork: InMemoryUnitOfWork,
  paymentGateway: PaymentGateway,
): VoidAuthorizationCommandHandler {
  return new VoidAuthorizationCommandHandler({ unitOfWork, paymentGateway, clock });
}

async function storeAuthorizedPayment(unitOfWork: InMemoryUnitOfWork): Promise<void> {
  await unitOfWork.payments.save(buildPayment());
}

describe('VoidAuthorizationCommandHandler', () => {
  it('voids the authorization once per saga at the gateway, records the void and replies AuthorizationVoided', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    await storeAuthorizedPayment(unitOfWork);
    const paymentGateway = new FakePaymentGateway();

    const outcome = await voidAuthorization(unitOfWork, paymentGateway).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(paymentGateway.voidRequests).toEqual([
      {
        idempotencyKey: `${sagaId}:VoidAuthorization`,
        authorizationId: authorizePaymentInput().gatewayAuthorizationId,
      },
    ]);
    expect((await unitOfWork.payments.findByOrderId(orderId))?.toSnapshot()).toMatchObject({
      state: { status: 'VOIDED', voidedAt, gatewayVoidId },
      version: 2,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('answers a payment it already voided again without voiding it twice', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const voided = buildPayment();
    unwrap(voided.void({ voidedAt: new Date('2026-10-02T12:00:50.000Z'), gatewayVoidId }));
    await unitOfWork.payments.save(voided);
    const paymentGateway = new FakePaymentGateway();

    const outcome = await voidAuthorization(unitOfWork, paymentGateway).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(paymentGateway.voidRequests).toEqual([]);
    expect((await unitOfWork.payments.findByOrderId(orderId))?.toSnapshot()).toMatchObject({
      state: { voidedAt: new Date('2026-10-02T12:00:50.000Z') },
      version: 1,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it('answers an order without a payment as voided, storing and voiding nothing', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const paymentGateway = new FakePaymentGateway();

    const outcome = await voidAuthorization(unitOfWork, paymentGateway).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(paymentGateway.voidRequests).toEqual([]);
    expect(unitOfWork.payments.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it('treats a void the gateway answered without a reference as a bug and records nothing', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    await storeAuthorizedPayment(unitOfWork);
    const blankReferenceGateway: PaymentGateway = {
      authorize: () => Promise.resolve(left({ type: 'PaymentDeclined', idempotencyKey: '' })),
      void: () => Promise.resolve({ voidId: '' }),
    };

    const execution = voidAuthorization(unitOfWork, blankReferenceGateway).execute(command);

    await expect(execution).rejects.toThrow('without a reference');
    expect((await unitOfWork.payments.findByOrderId(orderId))?.toSnapshot().state).toEqual({
      status: 'AUTHORIZED',
    });
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
