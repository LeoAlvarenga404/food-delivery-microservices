import { left, right, type Either } from '@fd/domain';
import type {
  PlaceOrderSagaOrder,
  PlaceOrderSagaState,
  PlaceOrderSagaStep,
} from './place-order.saga-state.ts';

export type PlaceOrderSagaReplyType =
  'ConsumerVerified' | 'TicketCreated' | 'PaymentAuthorized' | 'TicketApproved';

export interface PlaceOrderSagaReply {
  readonly type: PlaceOrderSagaReplyType;
}

export type ParticipantCommandType =
  'VerifyConsumer' | 'CreateTicket' | 'AuthorizePayment' | 'ApproveTicket';

export type PlaceOrderSagaCommandType = ParticipantCommandType | 'ApproveOrder';

export interface PlaceOrderSagaCommand<
  CommandType extends PlaceOrderSagaCommandType = PlaceOrderSagaCommandType,
> {
  readonly type: CommandType;
  readonly order: PlaceOrderSagaOrder;
}

export type ParticipantCommand = PlaceOrderSagaCommand<ParticipantCommandType>;

export interface UnexpectedSagaReply {
  readonly type: 'UnexpectedSagaReply';
  readonly step: PlaceOrderSagaStep;
  readonly replyType: PlaceOrderSagaReplyType;
}

export interface PlaceOrderSagaStart {
  readonly state: PlaceOrderSagaState;
  readonly commands: readonly ParticipantCommand[];
}

interface StepTransition {
  readonly awaitedStep: PlaceOrderSagaStep;
  readonly replyType: PlaceOrderSagaReplyType;
  readonly nextStep: PlaceOrderSagaStep;
  readonly nextCommandType: PlaceOrderSagaCommandType;
}

const happyPathTransitions: readonly StepTransition[] = [
  {
    awaitedStep: 'VERIFYING_CONSUMER',
    replyType: 'ConsumerVerified',
    nextStep: 'CREATING_TICKET',
    nextCommandType: 'CreateTicket',
  },
  {
    awaitedStep: 'CREATING_TICKET',
    replyType: 'TicketCreated',
    nextStep: 'AUTHORIZING_PAYMENT',
    nextCommandType: 'AuthorizePayment',
  },
  {
    awaitedStep: 'AUTHORIZING_PAYMENT',
    replyType: 'PaymentAuthorized',
    nextStep: 'APPROVING_TICKET',
    nextCommandType: 'ApproveTicket',
  },
  {
    awaitedStep: 'APPROVING_TICKET',
    replyType: 'TicketApproved',
    nextStep: 'COMPLETED',
    nextCommandType: 'ApproveOrder',
  },
];

function findTransition(
  state: PlaceOrderSagaState,
  reply: PlaceOrderSagaReply,
): StepTransition | undefined {
  return happyPathTransitions.find(
    (transition) => transition.awaitedStep === state.step && transition.replyType === reply.type,
  );
}

export const placeOrderSaga = {
  start(order: PlaceOrderSagaOrder): PlaceOrderSagaStart {
    return {
      state: { step: 'VERIFYING_CONSUMER', order },
      commands: [{ type: 'VerifyConsumer', order }],
    };
  },

  decide(
    state: PlaceOrderSagaState,
    reply: PlaceOrderSagaReply,
  ): Either<UnexpectedSagaReply, readonly PlaceOrderSagaCommand[]> {
    const transition = findTransition(state, reply);
    if (transition === undefined) {
      return left({ type: 'UnexpectedSagaReply', step: state.step, replyType: reply.type });
    }
    return right([{ type: transition.nextCommandType, order: state.order }]);
  },

  evolve(state: PlaceOrderSagaState, reply: PlaceOrderSagaReply): PlaceOrderSagaState {
    const transition = findTransition(state, reply);
    if (transition === undefined) return state;
    return { ...state, step: transition.nextStep };
  },
};
