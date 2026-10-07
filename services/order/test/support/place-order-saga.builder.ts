import {
  placeOrderSagaDeadline,
  type PlaceOrderSagaTimeoutsInMilliseconds,
} from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';
import type {
  PlaceOrderSagaInstance,
  PlaceOrderSagaOrder,
  PlaceOrderSagaState,
} from '#application/sagas/place-order/place-order.saga-state.ts';
import { buildOrder } from './order.builder.ts';

export const sagaPaymentToken = 'tok_visa_4242';

export const sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds = {
  VERIFYING_CONSUMER: 10_000,
  CREATING_TICKET: 20_000,
  AUTHORIZING_PAYMENT: 60_000,
  APPROVING_TICKET: 30_000,
  REJECTING_TICKET: 40_000,
};

const sagaStartedAt = new Date('2026-10-02T12:00:00.000Z');

export function buildSagaOrder(): PlaceOrderSagaOrder {
  const { orderId, consumerId, restaurantId, lineItems, totalInCents, currency } =
    buildOrder().toSnapshot();
  return { orderId, consumerId, restaurantId, lineItems, totalInCents, currency };
}

export function buildStartedSagaState(): PlaceOrderSagaState {
  return { step: 'VERIFYING_CONSUMER', order: buildSagaOrder(), paymentToken: sagaPaymentToken };
}

export function buildSagaInstance(
  state: PlaceOrderSagaState = buildStartedSagaState(),
): PlaceOrderSagaInstance {
  return {
    sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
    state,
    version: 0,
    deadlineAt: placeOrderSagaDeadline(state.step, sagaStartedAt, sagaTimeoutsInMilliseconds),
  };
}
