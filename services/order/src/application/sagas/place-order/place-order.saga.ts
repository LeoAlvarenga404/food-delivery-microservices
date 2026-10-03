import { left, right, type Either } from '@fd/domain';
import type { OrderRejectionReason } from '#domain/order/order.state.ts';
import type {
  AfterPivotSagaState,
  BeforePivotSagaState,
  CompensationSagaState,
  PlaceOrderSagaOrder,
  PlaceOrderSagaState,
  PlaceOrderSagaStep,
} from './place-order.saga-state.ts';

export interface SuccessReply {
  readonly type:
    | 'ConsumerVerified'
    | 'TicketCreated'
    | 'PaymentAuthorized'
    | 'TicketApproved'
    | 'TicketRejected';
}

export interface FailureReply {
  readonly type: 'ConsumerVerificationFailed' | 'TicketCreationFailed' | 'PaymentFailed';
  readonly rejectionReason: OrderRejectionReason;
}

export interface StepTimedOut {
  readonly type: 'StepTimedOut';
}

export type PlaceOrderSagaReply = SuccessReply | FailureReply | StepTimedOut;

export type PlaceOrderSagaReplyType = PlaceOrderSagaReply['type'];

export type ParticipantCommand =
  | {
      readonly type: 'VerifyConsumer' | 'CreateTicket' | 'ApproveTicket' | 'RejectTicket';
      readonly order: PlaceOrderSagaOrder;
    }
  | {
      readonly type: 'AuthorizePayment';
      readonly order: PlaceOrderSagaOrder;
      readonly paymentToken: string;
    };

export type PlaceOrderSagaCommand =
  | ParticipantCommand
  | { readonly type: 'ApproveOrder'; readonly order: PlaceOrderSagaOrder }
  | {
      readonly type: 'RejectOrder';
      readonly order: PlaceOrderSagaOrder;
      readonly rejectionReason: OrderRejectionReason;
    };

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

function rejectOrder(
  order: PlaceOrderSagaOrder,
  rejectionReason: OrderRejectionReason,
): SagaTransition {
  return {
    state: { step: 'COMPENSATED', order, rejectionReason },
    commands: [{ type: 'RejectOrder', order, rejectionReason }],
  };
}

function rejectTicket(
  order: PlaceOrderSagaOrder,
  rejectionReason: OrderRejectionReason,
): SagaTransition {
  return {
    state: { step: 'REJECTING_TICKET', order, rejectionReason },
    commands: [{ type: 'RejectTicket', order }],
  };
}

function sendAgain(
  state: PlaceOrderSagaState,
  commandType: 'ApproveTicket' | 'RejectTicket',
): SagaTransition {
  return { state, commands: [{ type: commandType, order: state.order }] };
}

function timeoutTransition(state: PlaceOrderSagaState): SagaTransition | undefined {
  switch (state.step) {
    case 'VERIFYING_CONSUMER':
      return rejectOrder(state.order, 'CONSUMER_VERIFICATION_TIMED_OUT');
    case 'CREATING_TICKET':
      return rejectTicket(state.order, 'TICKET_CREATION_TIMED_OUT');
    case 'AUTHORIZING_PAYMENT':
      return rejectTicket(state.order, 'PAYMENT_AUTHORIZATION_TIMED_OUT');
    case 'APPROVING_TICKET':
      return sendAgain(state, 'ApproveTicket');
    case 'REJECTING_TICKET':
      return sendAgain(state, 'RejectTicket');
    case 'COMPLETED':
    case 'COMPENSATED':
      return undefined;
  }
}

function afterConsumerVerification(
  { order, paymentToken }: BeforePivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type === 'ConsumerVerificationFailed') return rejectOrder(order, reply.rejectionReason);
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
  if (reply.type === 'TicketCreationFailed') return rejectOrder(order, reply.rejectionReason);
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
  if (reply.type === 'PaymentFailed') return rejectTicket(order, reply.rejectionReason);
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

function afterTicketRejection(
  { order, rejectionReason }: CompensationSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type !== 'TicketRejected') return undefined;
  return rejectOrder(order, rejectionReason);
}

function replyTransition(
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
    case 'REJECTING_TICKET':
      return afterTicketRejection(state, reply);
    case 'COMPLETED':
    case 'COMPENSATED':
      return undefined;
  }
}

function transition(
  state: PlaceOrderSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type === 'StepTimedOut') return timeoutTransition(state);
  return replyTransition(state, reply);
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
