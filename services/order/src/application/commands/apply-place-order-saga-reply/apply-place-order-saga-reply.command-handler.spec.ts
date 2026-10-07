import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import { buildOrder, deliveryFeeInCents, unwrap } from '../../../../test/support/order.builder.ts';
import { buildPlaceOrderCommand } from '../../../../test/support/place-order-command.builder.ts';
import {
  buildSagaOrder,
  sagaPaymentToken,
  sagaTimeoutsInMilliseconds,
} from '../../../../test/support/place-order-saga.builder.ts';
import { PlaceOrderCommandHandler } from '#application/commands/place-order/place-order.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { PlaceOrderSagaReply } from '#application/sagas/place-order/place-order.saga.ts';
import { ApplyPlaceOrderSagaReplyCommandHandler } from './apply-place-order-saga-reply.command-handler.ts';

const sagaId = '0199a5d0-0000-7000-8000-0000000000b1';
const { orderId } = buildOrder().toSnapshot();
const repliedAt = new Date('2026-10-02T12:00:30.000Z');
const replyMetadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000e1',
  causationId: '0199a5d0-0000-7000-8000-0000000000d1',
  actorId: undefined,
  actorType: undefined,
};

let unitOfWork: InMemoryUnitOfWork;
let applyReply: ApplyPlaceOrderSagaReplyCommandHandler;

async function deliver(reply: PlaceOrderSagaReply, toSagaId = sagaId) {
  return applyReply.execute({ sagaId: toSagaId, reply, metadata: replyMetadata });
}

async function readSagaStep(): Promise<string | undefined> {
  return (await unitOfWork.sagas.findById(sagaId))?.state.step;
}

async function readSagaDeadline(): Promise<Date | undefined> {
  return (await unitOfWork.sagas.findById(sagaId))?.deadlineAt;
}

async function readOrderState() {
  return (await unitOfWork.orders.findById(orderId))?.toSnapshot().state;
}

async function approveOrderElsewhere(): Promise<void> {
  const order = await unitOfWork.orders.findById(orderId);
  if (order === undefined) throw new Error('placed order is missing');
  unwrap(order.approve(repliedAt));
  await unitOfWork.orders.save(order);
}

beforeEach(async () => {
  unitOfWork = new InMemoryUnitOfWork();
  const placeOrder = new PlaceOrderCommandHandler({
    unitOfWork,
    clock: new FakeClock(),
    idGenerator: new FakeIdGenerator(),
    sagaTimeoutsInMilliseconds,
    deliveryFeeInCents,
  });
  unwrap(await placeOrder.execute(buildPlaceOrderCommand()));
  unitOfWork.commands.sentCommands.length = 0;
  applyReply = new ApplyPlaceOrderSagaReplyCommandHandler(
    unitOfWork,
    new FakeClock(repliedAt),
    sagaTimeoutsInMilliseconds,
  );
});

describe('ApplyPlaceOrderSagaReplyCommandHandler', () => {
  it('sends the next participant command for each reply of the happy path', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));
    unwrap(await deliver({ type: 'PaymentAuthorized' }));

    expect(unitOfWork.commands.sentCommands).toEqual([
      { command: { type: 'CreateTicket', order: buildSagaOrder() }, sagaId },
      {
        command: {
          type: 'AuthorizePayment',
          order: buildSagaOrder(),
          paymentToken: sagaPaymentToken,
        },
        sagaId,
      },
      { command: { type: 'ApproveTicket', order: buildSagaOrder() }, sagaId },
    ]);
    expect(await readSagaStep()).toBe('APPROVING_TICKET');
    expect(unitOfWork.executedMetadata.slice(1)).toEqual([
      replyMetadata,
      replyMetadata,
      replyMetadata,
    ]);
  });

  it('approves the order and completes the saga when the ticket is approved', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));
    unwrap(await deliver({ type: 'PaymentAuthorized' }));

    expect(await deliver({ type: 'TicketApproved' })).toEqual(right(undefined));

    expect(await readOrderState()).toEqual({ status: 'APPROVED', approvedAt: repliedAt });
    expect(await readSagaStep()).toBe('COMPLETED');
    expect(unitOfWork.commands.sentCommands).toHaveLength(3);
  });

  it('rejects the order at once when the consumer cannot be verified', async () => {
    const outcome = await deliver({
      type: 'ConsumerVerificationFailed',
      rejectionReason: 'CONSUMER_NOT_FOUND',
    });

    expect(outcome).toEqual(right(undefined));
    expect(await readOrderState()).toEqual({
      status: 'REJECTED',
      rejectionReason: 'CONSUMER_NOT_FOUND',
      rejectedAt: repliedAt,
    });
    expect(await readSagaStep()).toBe('COMPENSATED');
    expect(unitOfWork.commands.sentCommands).toEqual([]);
  });

  it('asks the kitchen to reject the ticket when the payment fails and keeps the order pending', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));

    unwrap(await deliver({ type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' }));

    expect(unitOfWork.commands.sentCommands.at(-1)).toEqual({
      command: { type: 'RejectTicket', order: buildSagaOrder() },
      sagaId,
    });
    expect(await readSagaStep()).toBe('REJECTING_TICKET');
    expect(await readOrderState()).toEqual({ status: 'APPROVAL_PENDING' });
  });

  it('rejects the order with the payment reason once the ticket is rejected', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));
    unwrap(await deliver({ type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' }));

    expect(await deliver({ type: 'TicketRejected' })).toEqual(right(undefined));

    expect(await readOrderState()).toEqual({
      status: 'REJECTED',
      rejectionReason: 'PAYMENT_DECLINED',
      rejectedAt: repliedAt,
    });
    expect(await readSagaStep()).toBe('COMPENSATED');
    expect(unitOfWork.commands.sentCommands).toHaveLength(3);
  });

  it('reports a reply for a saga it does not know', async () => {
    const unknownSagaId = '0199a5d0-0000-7000-8000-0000000000bf';

    expect(await deliver({ type: 'ConsumerVerified' }, unknownSagaId)).toEqual(
      left({ type: 'SagaNotFound', sagaId: unknownSagaId }),
    );
  });

  it('rejects a reply the saga is not waiting for and changes nothing', async () => {
    const outcome = await deliver({ type: 'PaymentAuthorized' });

    expect(outcome).toEqual(
      left({
        type: 'UnexpectedSagaReply',
        step: 'VERIFYING_CONSUMER',
        replyType: 'PaymentAuthorized',
      }),
    );
    expect(await readSagaStep()).toBe('VERIFYING_CONSUMER');
    expect(await readSagaDeadline()).toEqual(new Date('2026-10-02T12:00:10.000Z'));
    expect(unitOfWork.commands.sentCommands).toEqual([]);
  });

  it('gives the saga the deadline of the step a reply moves it to', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));

    expect(await readSagaDeadline()).toEqual(new Date('2026-10-02T12:00:50.000Z'));
  });

  it('clears the deadline once the saga is finished', async () => {
    unwrap(
      await deliver({ type: 'ConsumerVerificationFailed', rejectionReason: 'CONSUMER_BLOCKED' }),
    );

    expect(await readSagaStep()).toBe('COMPENSATED');
    expect(await readSagaDeadline()).toBeUndefined();
  });

  it('asks the kitchen again to approve the ticket when the approval step times out, with a later deadline', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));
    unwrap(await deliver({ type: 'PaymentAuthorized' }));
    const timedOutAt = new Date('2026-10-02T12:01:30.000Z');
    const applyLater = new ApplyPlaceOrderSagaReplyCommandHandler(
      unitOfWork,
      new FakeClock(timedOutAt),
      sagaTimeoutsInMilliseconds,
    );

    const outcome = await applyLater.execute({
      sagaId,
      reply: { type: 'StepTimedOut' },
      metadata: replyMetadata,
    });

    expect(outcome).toEqual(right(undefined));
    expect(unitOfWork.commands.sentCommands.slice(-2)).toEqual([
      { command: { type: 'ApproveTicket', order: buildSagaOrder() }, sagaId },
      { command: { type: 'ApproveTicket', order: buildSagaOrder() }, sagaId },
    ]);
    expect(await readSagaStep()).toBe('APPROVING_TICKET');
    expect(await readSagaDeadline()).toEqual(new Date('2026-10-02T12:02:00.000Z'));
  });

  it('leaves the saga waiting when the order was approved elsewhere', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));
    unwrap(await deliver({ type: 'PaymentAuthorized' }));
    await approveOrderElsewhere();
    const versionBefore = (await unitOfWork.orders.findById(orderId))?.toSnapshot().version;
    const sentCommandCount = unitOfWork.commands.sentCommands.length;

    const outcome = await deliver({ type: 'TicketApproved' });

    expect(outcome).toEqual(
      left({ type: 'InvalidOrderTransition', from: 'APPROVED', to: 'APPROVED' }),
    );
    expect(await readSagaStep()).toBe('APPROVING_TICKET');
    expect((await unitOfWork.orders.findById(orderId))?.toSnapshot().version).toBe(versionBefore);
    expect(unitOfWork.commands.sentCommands).toHaveLength(sentCommandCount);
  });

  it('leaves the saga compensating when the order was approved elsewhere', async () => {
    unwrap(await deliver({ type: 'ConsumerVerified' }));
    unwrap(await deliver({ type: 'TicketCreated' }));
    unwrap(await deliver({ type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' }));
    await approveOrderElsewhere();

    const outcome = await deliver({ type: 'TicketRejected' });

    expect(outcome).toEqual(
      left({ type: 'InvalidOrderTransition', from: 'APPROVED', to: 'REJECTED' }),
    );
    expect(await readSagaStep()).toBe('REJECTING_TICKET');
    expect(await readOrderState()).toEqual({ status: 'APPROVED', approvedAt: repliedAt });
  });
});
