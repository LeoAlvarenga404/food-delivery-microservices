import { left } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import type { ConsumerReply } from '#application/ports/reply-sender.port.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import { activeConsumerId } from './consumer.builder.ts';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.adapter.ts';

const metadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
  causationId: undefined,
  traceparent: undefined,
  actorId: undefined,
  actorType: undefined,
};
const reply: ConsumerReply = {
  type: 'ConsumerVerified',
  consumerId: activeConsumerId,
  orderId: '0199a5d0-0000-7000-8000-0000000000a1',
};

describe('InMemoryUnitOfWork', () => {
  it('drops the replies of work that returned a left', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    await unitOfWork.execute(metadata, (scope) => {
      scope.replies.send(reply, '0199a5d0-0000-7000-8000-0000000000b1');
      return Promise.resolve(left('rejected'));
    });

    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });

  it('drops the replies of work that threw', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const execution = unitOfWork.execute(metadata, (scope) => {
      scope.replies.send(reply, '0199a5d0-0000-7000-8000-0000000000b1');
      return Promise.reject(new Error('connection lost'));
    });

    await expect(execution).rejects.toThrow('connection lost');
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
