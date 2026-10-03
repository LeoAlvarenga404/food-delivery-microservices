import { left } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.adapter.ts';
import { buildTicket, orderId, ticketId } from './ticket.builder.ts';

const metadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
  causationId: undefined,
  traceparent: undefined,
  actorId: undefined,
  actorType: undefined,
};
const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';

describe('InMemoryUnitOfWork', () => {
  it('drops the tickets and replies of work that returned a left', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    await unitOfWork.execute(metadata, async (scope) => {
      await scope.tickets.save(buildTicket());
      scope.replies.send({ type: 'TicketCreated', orderId, ticketId }, sagaId);
      return left('rejected');
    });

    expect(unitOfWork.tickets.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });

  it('drops the tickets and replies of work that threw', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const execution = unitOfWork.execute(metadata, async (scope) => {
      await scope.tickets.save(buildTicket());
      scope.replies.send({ type: 'TicketCreated', orderId, ticketId }, sagaId);
      throw new Error('connection lost');
    });

    await expect(execution).rejects.toThrow('connection lost');
    expect(unitOfWork.tickets.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
