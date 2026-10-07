import type { OrderRejectionReason } from '#domain/order/order.state.ts';
import type {
  CompensationSagaState,
  PlaceOrderSagaOrder,
  PlaceOrderSagaReply,
  SagaTransition,
} from './place-order.saga-state.ts';

export function rejectOrder(
  order: PlaceOrderSagaOrder,
  rejectionReason: OrderRejectionReason,
): SagaTransition {
  return {
    state: { step: 'COMPENSATED', order, rejectionReason },
    commands: [{ type: 'RejectOrder', order, rejectionReason }],
  };
}

export function rejectTicket(
  order: PlaceOrderSagaOrder,
  rejectionReason: OrderRejectionReason,
): SagaTransition {
  return {
    state: { step: 'REJECTING_TICKET', order, rejectionReason },
    commands: [{ type: 'RejectTicket', order }],
  };
}

function settleLatePayment(
  state: CompensationSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  if (reply.type === 'PaymentAuthorized') {
    return { state, commands: [{ type: 'VoidAuthorization', order: state.order }] };
  }
  if (reply.type === 'AuthorizationVoided') return { state, commands: [] };
  return undefined;
}

export function placeOrderSagaCompensation(
  state: CompensationSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  const { order, rejectionReason } = state;
  const latePayment = settleLatePayment(state, reply);
  if (latePayment !== undefined || state.step === 'COMPENSATED') return latePayment;
  if (reply.type === 'StepTimedOut') return { state, commands: [{ type: 'RejectTicket', order }] };
  if (reply.type !== 'TicketRejected') return undefined;
  return rejectOrder(order, rejectionReason);
}
