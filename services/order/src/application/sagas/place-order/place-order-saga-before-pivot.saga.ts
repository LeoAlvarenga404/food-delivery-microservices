import { rejectOrder, rejectTicket } from './place-order-saga-compensation.saga.ts';
import type {
  BeforePivotSagaState,
  PlaceOrderSagaReply,
  SagaTransition,
} from './place-order.saga-state.ts';

function afterConsumerVerification(
  { order, paymentToken }: BeforePivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type === 'StepTimedOut') return rejectOrder(order, 'CONSUMER_VERIFICATION_TIMED_OUT');
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
  if (reply.type === 'StepTimedOut') return rejectTicket(order, 'TICKET_CREATION_TIMED_OUT');
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
  if (reply.type === 'StepTimedOut') return rejectTicket(order, 'PAYMENT_AUTHORIZATION_TIMED_OUT');
  if (reply.type === 'PaymentFailed') return rejectTicket(order, reply.rejectionReason);
  if (reply.type !== 'PaymentAuthorized') return undefined;
  return {
    state: { step: 'APPROVING_TICKET', order },
    commands: [{ type: 'ApproveTicket', order }],
  };
}

export function placeOrderSagaBeforePivot(
  state: BeforePivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  switch (state.step) {
    case 'VERIFYING_CONSUMER':
      return afterConsumerVerification(state, reply);
    case 'CREATING_TICKET':
      return afterTicketCreation(state, reply);
    case 'AUTHORIZING_PAYMENT':
      return afterPaymentAuthorization(state, reply);
  }
}
