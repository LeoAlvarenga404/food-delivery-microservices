import { right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  buildTicket,
  createTicketInput,
  orderId,
  ticketId,
  unwrap,
} from '../../../../test/support/ticket.builder.ts';
import type {
  KitchenReply,
  TicketCreationFailedReply,
} from '#application/ports/reply-sender.port.ts';
import type { TicketLineItem } from '#domain/ticket/ticket.aggregate.ts';
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

  it('answers TicketCreated again with the ticket it already created for the order', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const handler = createTicket(unitOfWork);
    const reply: KitchenReply = { type: 'TicketCreated', orderId, ticketId };
    unwrap(await handler.execute(command));

    const outcome = await handler.execute(command);

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.tickets.rows.size).toBe(1);
    expect(unitOfWork.replies.sentReplies).toEqual([
      { reply, sagaId },
      { reply, sagaId },
    ]);
  });

  it('answers TicketCreated again for a rejected ticket without saving anything', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const rejectedTicket = buildTicket();
    unwrap(rejectedTicket.reject());
    await unitOfWork.tickets.save(rejectedTicket);
    const savedTicketSnapshot = (await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot();
    const reply: KitchenReply = { type: 'TicketCreated', orderId, ticketId };

    const outcome = await createTicket(unitOfWork).execute(command);

    expect(outcome).toEqual(right(reply));
    expect(unitOfWork.tickets.rows.size).toBe(1);
    expect((await unitOfWork.tickets.findByOrderId(orderId))?.toSnapshot()).toEqual(
      savedTicketSnapshot,
    );
    expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
  });

  it.each<{
    readonly problem: string;
    readonly refusedLineItems: readonly TicketLineItem[];
    readonly reason: TicketCreationFailedReply['reason'];
  }>([
    { problem: 'without line items', refusedLineItems: [], reason: 'EmptyTicket' },
    {
      problem: 'with a quantity of zero',
      refusedLineItems: [
        { menuItemId: '0199a5d0-0000-7000-8000-000000000101', name: 'Pizza', quantity: 0 },
      ],
      reason: 'InvalidQuantity',
    },
  ])(
    'stores nothing and replies TicketCreationFailed for a ticket $problem',
    async ({ refusedLineItems, reason }) => {
      const unitOfWork = new InMemoryUnitOfWork();
      const reply: KitchenReply = { type: 'TicketCreationFailed', orderId, reason };

      const outcome = await createTicket(unitOfWork).execute({
        ...command,
        lineItems: refusedLineItems,
      });

      expect(outcome).toEqual(right(reply));
      expect(unitOfWork.tickets.rows.size).toBe(0);
      expect(unitOfWork.replies.sentReplies).toEqual([{ reply, sagaId }]);
    },
  );
});
