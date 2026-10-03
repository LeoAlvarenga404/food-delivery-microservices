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
  REJECTING_TICKET: { step: 'REJECTING_TICKET', order, rejectionReason: 'PAYMENT_DECLINED' },
  COMPENSATED: { step: 'COMPENSATED', order, rejectionReason: 'PAYMENT_DECLINED' },
};

const replies: readonly PlaceOrderSagaReply[] = [
  { type: 'ConsumerVerified' },
  { type: 'ConsumerVerificationFailed', rejectionReason: 'CONSUMER_NOT_FOUND' },
  { type: 'TicketCreated' },
  { type: 'TicketCreationFailed', rejectionReason: 'TICKET_REFUSED' },
  { type: 'PaymentAuthorized' },
  { type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' },
  { type: 'TicketApproved' },
  { type: 'TicketRejected' },
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
    state: sagaStates.VERIFYING_CONSUMER,
    reply: { type: 'ConsumerVerificationFailed', rejectionReason: 'CONSUMER_NOT_FOUND' },
    nextState: { step: 'COMPENSATED', order, rejectionReason: 'CONSUMER_NOT_FOUND' },
    commands: [{ type: 'RejectOrder', order, rejectionReason: 'CONSUMER_NOT_FOUND' }],
  },
  {
    state: sagaStates.CREATING_TICKET,
    reply: { type: 'TicketCreated' },
    nextState: sagaStates.AUTHORIZING_PAYMENT,
    commands: [{ type: 'AuthorizePayment', order, paymentToken }],
  },
  {
    state: sagaStates.CREATING_TICKET,
    reply: { type: 'TicketCreationFailed', rejectionReason: 'TICKET_REFUSED' },
    nextState: { step: 'COMPENSATED', order, rejectionReason: 'TICKET_REFUSED' },
    commands: [{ type: 'RejectOrder', order, rejectionReason: 'TICKET_REFUSED' }],
  },
  {
    state: sagaStates.AUTHORIZING_PAYMENT,
    reply: { type: 'PaymentAuthorized' },
    nextState: sagaStates.APPROVING_TICKET,
    commands: [{ type: 'ApproveTicket', order }],
  },
  {
    state: sagaStates.AUTHORIZING_PAYMENT,
    reply: { type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' },
    nextState: sagaStates.REJECTING_TICKET,
    commands: [{ type: 'RejectTicket', order }],
  },
  {
    state: sagaStates.APPROVING_TICKET,
    reply: { type: 'TicketApproved' },
    nextState: sagaStates.COMPLETED,
    commands: [{ type: 'ApproveOrder', order }],
  },
  {
    state: sagaStates.REJECTING_TICKET,
    reply: { type: 'TicketRejected' },
    nextState: sagaStates.COMPENSATED,
    commands: [{ type: 'RejectOrder', order, rejectionReason: 'PAYMENT_DECLINED' }],
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

  it.each<PlaceOrderSagaReply>([
    { type: 'PaymentAuthorized' },
    { type: 'PaymentFailed', rejectionReason: 'PAYMENT_DECLINED' },
  ])('forgets the payment token once $type answers the payment step', (reply) => {
    const nextState = placeOrderSaga.evolve(sagaStates.AUTHORIZING_PAYMENT, reply);

    expect(nextState).not.toHaveProperty('paymentToken');
  });

  it('rejects the order with the reason of the failed payment once the ticket is rejected', () => {
    const compensating = placeOrderSaga.evolve(sagaStates.AUTHORIZING_PAYMENT, {
      type: 'PaymentFailed',
      rejectionReason: 'PAYMENT_DECLINED',
    });

    expect(placeOrderSaga.decide(compensating, { type: 'TicketRejected' })).toEqual(
      right([{ type: 'RejectOrder', order, rejectionReason: 'PAYMENT_DECLINED' }]),
    );
  });
});

describe('placeOrderSaga with a reply it is not waiting for', () => {
  it('covers every pair outside the transitions', () => {
    expect(unexpectedPairs).toHaveLength(48);
  });

  it.each(unexpectedPairs)('in %s, rejects %o and keeps its state', (step, reply) => {
    const state = sagaStates[step];

    expect(placeOrderSaga.decide(state, reply)).toEqual(
      left({ type: 'UnexpectedSagaReply', step, replyType: reply.type }),
    );
    expect(placeOrderSaga.evolve(state, reply)).toBe(state);
  });
});
