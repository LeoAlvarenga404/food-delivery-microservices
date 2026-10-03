import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import {
  buildSagaOrder,
  sagaPaymentToken,
} from '../../../../test/support/place-order-saga.builder.ts';
import {
  placeOrderSaga,
  type PlaceOrderSagaCommand,
  type PlaceOrderSagaReply,
} from './place-order.saga.ts';
import type { PlaceOrderSagaState, PlaceOrderSagaStep } from './place-order.saga-state.ts';

const order = buildSagaOrder();
const paymentToken = sagaPaymentToken;

const sagaStates: Readonly<Record<PlaceOrderSagaStep, PlaceOrderSagaState>> = {
  VERIFYING_CONSUMER: { step: 'VERIFYING_CONSUMER', order, paymentToken },
  CREATING_TICKET: { step: 'CREATING_TICKET', order, paymentToken },
  AUTHORIZING_PAYMENT: { step: 'AUTHORIZING_PAYMENT', order, paymentToken },
  APPROVING_TICKET: { step: 'APPROVING_TICKET', order },
  COMPLETED: { step: 'COMPLETED', order },
};

const replies: readonly PlaceOrderSagaReply[] = [
  { type: 'ConsumerVerified' },
  { type: 'TicketCreated' },
  { type: 'PaymentAuthorized' },
  { type: 'TicketApproved' },
];

interface SagaTransition {
  readonly state: PlaceOrderSagaState;
  readonly reply: PlaceOrderSagaReply;
  readonly nextState: PlaceOrderSagaState;
  readonly commands: readonly PlaceOrderSagaCommand[];
}

const transitions: readonly SagaTransition[] = [
  {
    state: sagaStates.VERIFYING_CONSUMER,
    reply: { type: 'ConsumerVerified' },
    nextState: sagaStates.CREATING_TICKET,
    commands: [{ type: 'CreateTicket', order }],
  },
  {
    state: sagaStates.CREATING_TICKET,
    reply: { type: 'TicketCreated' },
    nextState: sagaStates.AUTHORIZING_PAYMENT,
    commands: [{ type: 'AuthorizePayment', order, paymentToken }],
  },
  {
    state: sagaStates.AUTHORIZING_PAYMENT,
    reply: { type: 'PaymentAuthorized' },
    nextState: sagaStates.APPROVING_TICKET,
    commands: [{ type: 'ApproveTicket', order }],
  },
  {
    state: sagaStates.APPROVING_TICKET,
    reply: { type: 'TicketApproved' },
    nextState: sagaStates.COMPLETED,
    commands: [{ type: 'ApproveOrder', order }],
  },
];

const unexpectedPairs = Object.values(sagaStates).flatMap((state) =>
  replies
    .filter(
      (reply) =>
        !transitions.some(
          (transition) =>
            transition.state.step === state.step && transition.reply.type === reply.type,
        ),
    )
    .map((reply): [PlaceOrderSagaStep, PlaceOrderSagaReply] => [state.step, reply]),
);

describe('placeOrderSaga.start', () => {
  it('starts by verifying the consumer and keeps the payment token for the payment step', () => {
    expect(placeOrderSaga.start(order, paymentToken)).toEqual({
      state: { step: 'VERIFYING_CONSUMER', order, paymentToken },
      commands: [{ type: 'VerifyConsumer', order }],
    });
  });
});

describe('placeOrderSaga transitions', () => {
  it.each(transitions)(
    'in $state.step, $reply.type moves to $nextState.step',
    ({ state, reply, nextState, commands }) => {
      expect(placeOrderSaga.decide(state, reply)).toEqual(right(commands));
      expect(placeOrderSaga.evolve(state, reply)).toEqual(nextState);
    },
  );

  it('forgets the payment token once the payment is authorized', () => {
    const nextState = placeOrderSaga.evolve(sagaStates.AUTHORIZING_PAYMENT, {
      type: 'PaymentAuthorized',
    });

    expect(nextState).not.toHaveProperty('paymentToken');
  });
});

describe('placeOrderSaga with a reply it is not waiting for', () => {
  it('covers every pair outside the transitions', () => {
    expect(unexpectedPairs).toHaveLength(16);
  });

  it.each(unexpectedPairs)('in %s, rejects %o and keeps its state', (step, reply) => {
    const state = sagaStates[step];

    expect(placeOrderSaga.decide(state, reply)).toEqual(
      left({ type: 'UnexpectedSagaReply', step, replyType: reply.type }),
    );
    expect(placeOrderSaga.evolve(state, reply)).toBe(state);
  });
});
