import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { buildTicket, orderId, ticketId, unwrap } from '../../../../test/support/ticket.builder.ts';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { RejectTicketCommand } from './reject-ticket.command.ts';
import { RejectTicketCommandHandler } from './reject-ticket.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const command: RejectTicketCommand = {
  orderId,
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d04',
    actorId: undefined,
    actorType: undefined,
  },
};
const reply: KitchenReply = { type: 'TicketRejected', orderId };

describe('RejectTicketCommandHandler', () => {
  it('rejects the pending ticket of the order and replies TicketRejected', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    await unitOfWork.tickets.save(buildTicket());

    const outcome = await new RejectTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot()).toMatchObject({
      status: 'REJECTED',
      version: 2,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('replies TicketRejected and stores nothing when the order has no ticket', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await new RejectTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.tickets.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it('answers TicketRejected again for a ticket it already rejected and keeps the ticket', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    await unitOfWork.tickets.save(buildTicket());
    unwrap(await new RejectTicketCommandHandler(unitOfWork).execute(command));

    const outcome = await new RejectTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.replies.sentReplies).toEqual([
      { reply, sagaId },
      { reply, sagaId },
    ]);
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot().version).toBe(2);
  });

  it('sends no reply and keeps the ticket when it was already approved', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const approved = buildTicket();
    unwrap(approved.approve());
    await unitOfWork.tickets.save(approved);

    const outcome = await new RejectTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(
      left({
        type: 'InvalidTicketTransition',
        ticketId,
        from: 'AWAITING_ACCEPTANCE',
        to: 'REJECTED',
      }),
    );
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot()).toMatchObject({
      status: 'AWAITING_ACCEPTANCE',
      version: 1,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
