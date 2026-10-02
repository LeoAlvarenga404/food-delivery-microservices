import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import type { ConsumerReply } from '#application/ports/reply-sender.port.ts';
import { activeConsumerId, buildConsumer } from '../../../../test/support/consumer.builder.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import type { VerifyConsumerCommand } from './verify-consumer.command.ts';
import { VerifyConsumerCommandHandler } from './verify-consumer.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const orderId = '0199a5d0-0000-7000-8000-0000000000a1';
const command: VerifyConsumerCommand = {
  consumerId: activeConsumerId,
  orderId,
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d01',
    traceparent: undefined,
    actorId: undefined,
    actorType: undefined,
  },
};

describe('VerifyConsumerCommandHandler', () => {
  it('replies ConsumerVerified to the saga when the consumer may order', async () => {
    const unitOfWork = new InMemoryUnitOfWork([buildConsumer()]);
    const reply: ConsumerReply = {
      type: 'ConsumerVerified',
      consumerId: activeConsumerId,
      orderId,
    };

    const outcome = await new VerifyConsumerCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('sends no reply for a blocked consumer', async () => {
    const unitOfWork = new InMemoryUnitOfWork([buildConsumer({ status: 'BLOCKED' })]);

    const outcome = await new VerifyConsumerCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(left({ type: 'ConsumerBlocked', consumerId: activeConsumerId }));
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });

  it('sends no reply for a consumer it does not know', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await new VerifyConsumerCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(left({ type: 'ConsumerNotFound', consumerId: activeConsumerId }));
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
