import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { buildOrder, unwrap } from '../../../../test/support/order.builder.ts';
import { buildPlaceOrderCommand } from '../../../../test/support/place-order-command.builder.ts';
import { buildSagaOrder } from '../../../../test/support/place-order-saga.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { PlaceOrderSagaReplyType } from '#application/sagas/place-order/place-order.saga.ts';
import { ApplyPlaceOrderSagaReplyCommandHandler } from './apply-place-order-saga-reply.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const { orderId } = buildOrder().toSnapshot();
const approvedAt = new Date('2026-10-02T12:00:30.000Z');
const replyMetadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
  causationId: '0199a5d0-0000-7000-8000-0000000000d1',
  traceparent: undefined,
  actorId: undefined,
  actorType: undefined,
};

let unitOfWork: InMemoryUnitOfWork;
let applyReply: ApplyPlaceOrderSagaReplyCommandHandler;

async function deliver(replyType: PlaceOrderSagaReplyType, toSagaId = sagaId) {
  return applyReply.execute({
    sagaId: toSagaId,
    reply: { type: replyType },
    metadata: replyMetadata,
  });
}

beforeEach(async () => {
  unitOfWork = new InMemoryUnitOfWork();
  const placeOrder = new PlaceOrderCommandHandler(
    unitOfWork,
    new FakeClock(),
    new FakeIdGenerator(),
  );
  unwrap(await placeOrder.execute(buildPlaceOrderCommand()));
  unitOfWork.commands.sentCommands.length = 0;
  applyReply = new ApplyPlaceOrderSagaReplyCommandHandler(unitOfWork, new FakeClock(approvedAt));
});

describe('ApplyPlaceOrderSagaReplyCommandHandler', () => {
  it('sends the next participant command for each reply of the happy path', async () => {
    unwrap(await deliver('ConsumerVerified'));
    unwrap(await deliver('TicketCreated'));
    unwrap(await deliver('PaymentAuthorized'));

    expect(unitOfWork.commands.sentCommands).toEqual([
      { command: { type: 'CreateTicket', order: buildSagaOrder() }, sagaId },
      { command: { type: 'AuthorizePayment', order: buildSagaOrder() }, sagaId },
      { command: { type: 'ApproveTicket', order: buildSagaOrder() }, sagaId },
    ]);
    expect((await unitOfWork.sagas.findById(sagaId))?.state.step).toBe('APPROVING_TICKET');
    expect(unitOfWork.executedMetadata.slice(1)).toEqual([
      replyMetadata,
      replyMetadata,
      replyMetadata,
    ]);
  });

  it('approves the order and completes the saga when the ticket is approved', async () => {
    unwrap(await deliver('ConsumerVerified'));
    unwrap(await deliver('TicketCreated'));
    unwrap(await deliver('PaymentAuthorized'));

    expect(await deliver('TicketApproved')).toEqual(right(undefined));

    const approvedOrder = await unitOfWork.orders.findById(orderId);
    expect(approvedOrder?.toSnapshot().state).toEqual({ status: 'APPROVED', approvedAt });
    expect((await unitOfWork.sagas.findById(sagaId))?.state.step).toBe('COMPLETED');
    expect(unitOfWork.commands.sentCommands).toHaveLength(3);
  });

  it('reports a reply for a saga it does not know', async () => {
    const unknownSagaId = '0199a5d0-0000-7000-8000-0000000000bf';

    expect(await deliver('ConsumerVerified', unknownSagaId)).toEqual(
      left({ type: 'SagaNotFound', sagaId: unknownSagaId }),
    );
  });

  it('rejects a reply the saga is not waiting for and changes nothing', async () => {
    const outcome = await deliver('PaymentAuthorized');

    expect(outcome).toEqual(
      left({
        type: 'UnexpectedSagaReply',
        step: 'VERIFYING_CONSUMER',
        replyType: 'PaymentAuthorized',
      }),
    );
    expect((await unitOfWork.sagas.findById(sagaId))?.state.step).toBe('VERIFYING_CONSUMER');
    expect(unitOfWork.commands.sentCommands).toEqual([]);
  });
});
