import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { createTicketInput, orderId, ticketId } from '../../../../test/support/ticket.builder.ts';
import type { KitchenReply } from '#application/ports/reply-sender.port.ts';
import type { CreateTicketCommand } from './create-ticket.command.ts';
import { CreateTicketCommandHandler } from './create-ticket.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const { restaurantId, lineItems } = createTicketInput();
const command: CreateTicketCommand = {
  orderId,
  restaurantId,
  lineItems,
  sagaId,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
    causationId: '0199a5d0-0000-7000-8000-000000000d01',
    traceparent: undefined,
    actorId: undefined,
    actorType: undefined,
  },
};

function createTicket(unitOfWork: InMemoryUnitOfWork): CreateTicketCommandHandler {
  return new CreateTicketCommandHandler(unitOfWork, new FakeIdGenerator());
}

describe('CreateTicketCommandHandler', () => {
  it('stores a pending ticket and replies TicketCreated to the saga', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const reply: KitchenReply = { type: 'TicketCreated', orderId, ticketId };

    const outcome = await createTicket(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot()).toMatchObject({
      ticketId,
      status: 'CREATE_PENDING',
      lineItems,
    });
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('stores nothing and sends no reply for a ticket without line items', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await createTicket(unitOfWork).execute({ ...command, lineItems: [] });

    expect(outcome).toEqual(left({ type: 'EmptyTicket', orderId }));
    expect(unitOfWork.tickets.rows.size).toBe(0);
    expect(unitOfWork.replies.sentReplies).toEqual([]);
  });
});
