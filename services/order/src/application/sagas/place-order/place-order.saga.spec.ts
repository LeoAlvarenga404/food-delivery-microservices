import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { buildSagaOrder } from '../../../../test/support/place-order-saga.builder.ts';
import {
  placeOrderSaga,
  type PlaceOrderSagaCommandType,
  type PlaceOrderSagaReplyType,
} from './place-order.saga.ts';
import type { PlaceOrderSagaStep } from './place-order.saga-state.ts';

const order = buildSagaOrder();

describe('placeOrderSaga.start', () => {
  it('starts by verifying the consumer', () => {
    expect(placeOrderSaga.start(order)).toEqual({
      state: { step: 'VERIFYING_CONSUMER', order },
      commands: [{ type: 'VerifyConsumer', order }],
    });
  });
});

interface HappyPathTransition {
  readonly step: PlaceOrderSagaStep;
  readonly replyType: PlaceOrderSagaReplyType;
  readonly nextStep: PlaceOrderSagaStep;
  readonly commandType: PlaceOrderSagaCommandType;
}

const happyPath: readonly HappyPathTransition[] = [
  {
    step: 'VERIFYING_CONSUMER',
    replyType: 'ConsumerVerified',
    nextStep: 'CREATING_TICKET',
    commandType: 'CreateTicket',
  },
  {
    step: 'CREATING_TICKET',
    replyType: 'TicketCreated',
    nextStep: 'AUTHORIZING_PAYMENT',
    commandType: 'AuthorizePayment',
  },
  {
    step: 'AUTHORIZING_PAYMENT',
    replyType: 'PaymentAuthorized',
    nextStep: 'APPROVING_TICKET',
    commandType: 'ApproveTicket',
  },
  {
    step: 'APPROVING_TICKET',
    replyType: 'TicketApproved',
    nextStep: 'COMPLETED',
    commandType: 'ApproveOrder',
  },
];

const steps: readonly PlaceOrderSagaStep[] = [
  'VERIFYING_CONSUMER',
  'CREATING_TICKET',
  'AUTHORIZING_PAYMENT',
  'APPROVING_TICKET',
  'COMPLETED',
];
const replyTypes: readonly PlaceOrderSagaReplyType[] = [
  'ConsumerVerified',
  'TicketCreated',
  'PaymentAuthorized',
  'TicketApproved',
];
const unexpectedPairs = steps.flatMap((step) =>
  replyTypes
    .filter(
      (replyType) =>
        !happyPath.some((entry) => entry.step === step && entry.replyType === replyType),
    )
    .map((replyType): [PlaceOrderSagaStep, PlaceOrderSagaReplyType] => [step, replyType]),
);

describe('placeOrderSaga happy path', () => {
  it.each(happyPath)(
    'in $step, $replyType moves to $nextStep and asks for $commandType',
    ({ step, replyType, nextStep, commandType }) => {
      const state = { step, order };
      const reply = { type: replyType };

      expect(placeOrderSaga.decide(state, reply)).toEqual(right([{ type: commandType, order }]));
      expect(placeOrderSaga.evolve(state, reply)).toEqual({ step: nextStep, order });
    },
  );
});

describe('placeOrderSaga with a reply it is not waiting for', () => {
  it('covers every pair outside the happy path', () => {
    expect(unexpectedPairs).toHaveLength(16);
  });

  it.each(unexpectedPairs)('in %s, rejects %s and keeps its state', (step, replyType) => {
    const state = { step, order };
    const reply = { type: replyType };

    expect(placeOrderSaga.decide(state, reply)).toEqual(
      left({ type: 'UnexpectedSagaReply', step, replyType }),
    );
    expect(placeOrderSaga.evolve(state, reply)).toBe(state);
  });
});
