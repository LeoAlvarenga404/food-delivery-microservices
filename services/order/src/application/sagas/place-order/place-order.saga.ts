import { left, right, type Either } from '@fd/domain';
import { placeOrderSagaAfterPivot } from './place-order-saga-after-pivot.saga.ts';
import { placeOrderSagaBeforePivot } from './place-order-saga-before-pivot.saga.ts';
import { placeOrderSagaCompensation } from './place-order-saga-compensation.saga.ts';
import type {
  ParticipantCommand,
  PlaceOrderSagaCommand,
  PlaceOrderSagaOrder,
  PlaceOrderSagaReply,
  PlaceOrderSagaReplyType,
  PlaceOrderSagaState,
  PlaceOrderSagaStep,
  SagaTransition,
} from './place-order.saga-state.ts';

export interface UnexpectedSagaReply {
  readonly type: 'UnexpectedSagaReply';
  readonly step: PlaceOrderSagaStep;
  readonly replyType: PlaceOrderSagaReplyType;
}

export interface PlaceOrderSagaStart {
  readonly state: PlaceOrderSagaState;
  readonly commands: readonly ParticipantCommand[];
}

function transition(
  state: PlaceOrderSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  switch (state.step) {
    case 'VERIFYING_CONSUMER':
    case 'CREATING_TICKET':
    case 'AUTHORIZING_PAYMENT':
      return placeOrderSagaBeforePivot(state, reply);
    case 'APPROVING_TICKET':
    case 'COMPLETED':
      return placeOrderSagaAfterPivot(state, reply);
    case 'REJECTING_TICKET':
    case 'COMPENSATED':
      return placeOrderSagaCompensation(state, reply);
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
