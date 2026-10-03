import { left } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.adapter.ts';
import { buildPayment, orderId, paymentId } from './payment.builder.ts';

const metadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
  causationId: undefined,
  traceparent: undefined,
  actorId: undefined,
  actorType: undefined,
};
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';

describe('InMemoryUnitOfWork', () => {
  it('drops the payments and replies of work that returned a left', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    await unitOfWork.execute(metadata, async (scope) => {
      await scope.payments.save(buildPayment());
      scope.replies.send({ type: 'PaymentAuthorized', orderId, paymentId }, sagaId);
      return left('rejected');
    });

    expect(unitOfWork.payments.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });

  it('drops the payments and replies of work that threw', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const execution = unitOfWork.execute(metadata, async (scope) => {
      await scope.payments.save(buildPayment());
      scope.replies.send({ type: 'PaymentAuthorized', orderId, paymentId }, sagaId);
      throw new Error('connection lost');
    });

    await expect(execution).rejects.toThrow('connection lost');
    expect(unitOfWork.payments.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
