import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { buildTicket, orderId, ticketId, unwrap } from '../../../../test/support/ticket.builder.ts';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { ApproveTicketCommand } from './approve-ticket.command.ts';
import { ApproveTicketCommandHandler } from './approve-ticket.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const command: ApproveTicketCommand = {
  orderId,
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d02',
    actorId: undefined,
    actorType: undefined,
  },
};

async function unitOfWorkWithTicket(): Promise<InMemoryUnitOfWork> {
  const unitOfWork = new InMemoryUnitOfWork();
  await unitOfWork.tickets.save(buildTicket());
  return unitOfWork;
}

describe('ApproveTicketCommandHandler', () => {
  it('moves the ticket of the order to awaiting acceptance and replies TicketApproved', async () => {
    const unitOfWork = await unitOfWorkWithTicket();
    const reply: KitchenReply = { type: 'TicketApproved', orderId, ticketId };

    const outcome = await new ApproveTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot()).toMatchObject({
      status: 'AWAITING_ACCEPTANCE',
      version: 2,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it('sends no reply when the order has no ticket', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await new ApproveTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(left({ type: 'TicketNotFound', orderId }));
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });

  it('answers TicketApproved again for a ticket it already approved and keeps the ticket', async () => {
    const unitOfWork = await unitOfWorkWithTicket();
    const reply: KitchenReply = { type: 'TicketApproved', orderId, ticketId };
    unwrap(await new ApproveTicketCommandHandler(unitOfWork).execute(command));

    const outcome = await new ApproveTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.replies.sentReplies).toEqual([
      { reply, sagaId },
      { reply, sagaId },
    ]);
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot().version).toBe(2);
  });

  it('sends no reply and keeps a rejected ticket', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const rejected = buildTicket();
    unwrap(rejected.reject());
    await unitOfWork.tickets.save(rejected);

    const outcome = await new ApproveTicketCommandHandler(unitOfWork).execute(command);

    expect(outcome).toEqual(
      left({
        type: 'InvalidTicketTransition',
        ticketId,
        from: 'REJECTED',
        to: 'AWAITING_ACCEPTANCE',
      }),
    );
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
