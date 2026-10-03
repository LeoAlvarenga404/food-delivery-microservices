import { left, right, type Either } from '@fd/domain';
import type {
  AfterPivotSagaState,
  BeforePivotSagaState,
  PlaceOrderSagaOrder,
  PlaceOrderSagaState,
  PlaceOrderSagaStep,
} from './place-order.saga-state.ts';

export interface PlaceOrderSagaReply {
  readonly type: 'ConsumerVerified' | 'TicketCreated' | 'PaymentAuthorized' | 'TicketApproved';
}

export type PlaceOrderSagaReplyType = PlaceOrderSagaReply['type'];

export type ParticipantCommand =
  | {
      readonly type: 'VerifyConsumer' | 'CreateTicket' | 'ApproveTicket';
      readonly order: PlaceOrderSagaOrder;
    }
  | {
      readonly type: 'AuthorizePayment';
      readonly order: PlaceOrderSagaOrder;
      readonly paymentToken: string;
    };

export type PlaceOrderSagaCommand =
  ParticipantCommand | { readonly type: 'ApproveOrder'; readonly order: PlaceOrderSagaOrder };

export interface UnexpectedSagaReply {
  readonly type: 'UnexpectedSagaReply';
  readonly step: PlaceOrderSagaStep;
  readonly replyType: PlaceOrderSagaReplyType;
}

export interface PlaceOrderSagaStart {
  readonly state: PlaceOrderSagaState;
  readonly commands: readonly ParticipantCommand[];
}

interface SagaTransition {
  readonly state: PlaceOrderSagaState;
  readonly commands: readonly PlaceOrderSagaCommand[];
}

function afterConsumerVerification(
  { order, paymentToken }: BeforePivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type !== 'ConsumerVerified') return undefined;
  return {
    state: { step: 'CREATING_TICKET', order, paymentToken },
    commands: [{ type: 'CreateTicket', order }],
  };
}

function afterTicketCreation(
  { order, paymentToken }: BeforePivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type !== 'TicketCreated') return undefined;
  return {
    state: { step: 'AUTHORIZING_PAYMENT', order, paymentToken },
    commands: [{ type: 'AuthorizePayment', order, paymentToken }],
  };
}

function afterPaymentAuthorization(
  { order }: BeforePivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type !== 'PaymentAuthorized') return undefined;
  return {
    state: { step: 'APPROVING_TICKET', order },
    commands: [{ type: 'ApproveTicket', order }],
  };
}

function afterTicketApproval(
  { order }: AfterPivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type !== 'TicketApproved') return undefined;
  return { state: { step: 'COMPLETED', order }, commands: [{ type: 'ApproveOrder', order }] };
}

function transition(
  state: PlaceOrderSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  switch (state.step) {
    case 'VERIFYING_CONSUMER':
      return afterConsumerVerification(state, reply);
    case 'CREATING_TICKET':
      return afterTicketCreation(state, reply);
    case 'AUTHORIZING_PAYMENT':
      return afterPaymentAuthorization(state, reply);
    case 'APPROVING_TICKET':
      return afterTicketApproval(state, reply);
    case 'COMPLETED':
      return undefined;
  }
}

export const placeOrderSaga = {
  start(order: PlaceOrderSagaOrder, paymentToken: string): PlaceOrderSagaStart {
    return {
      state: { step: 'VERIFYING_CONSUMER', order, paymentToken },
      commands: [{ type: 'VerifyConsumer', order }],
    };
  },

  decide(
    state: PlaceOrderSagaState,
    reply: PlaceOrderSagaReply,
  ): Either<UnexpectedSagaReply, readonly PlaceOrderSagaCommand[]> {
    const next = transition(state, reply);
    if (next === undefined) {
      return left({ type: 'UnexpectedSagaReply', step: state.step, replyType: reply.type });
    }
    return right(next.commands);
  },

  evolve(state: PlaceOrderSagaState, reply: PlaceOrderSagaReply): PlaceOrderSagaState {
    return transition(state, reply)?.state ?? state;
  },
};
