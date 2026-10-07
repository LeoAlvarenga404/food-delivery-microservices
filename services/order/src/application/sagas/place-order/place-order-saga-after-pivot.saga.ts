import type {
  AfterPivotSagaState,
  PlaceOrderSagaReply,
  SagaTransition,
} from './place-order.saga-state.ts';

export function placeOrderSagaAfterPivot(
  state: AfterPivotSagaState,
  reply: PlaceOrderSagaReply,
): SagaTransition | undefined {
  const { order } = state;
  if (state.step === 'COMPLETED') return undefined;
  if (reply.type === 'StepTimedOut') return { state, commands: [{ type: 'ApproveTicket', order }] };
  if (reply.type !== 'TicketApproved') return undefined;
  return { state: { step: 'COMPLETED', order }, commands: [{ type: 'ApproveOrder', order }] };
}
