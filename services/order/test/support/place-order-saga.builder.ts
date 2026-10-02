import type {
  PlaceOrderSagaOrder,
  PlaceOrderSagaStep,
  PlaceOrderSagaInstance,
} from '#application/sagas/place-order/place-order.saga-state.ts';
import { buildOrder } from './order.builder.ts';

export function buildSagaOrder(): PlaceOrderSagaOrder {
  const { orderId, consumerId, restaurantId, lineItems, totalInCents, currency } =
    buildOrder().toSnapshot();
  return {
    orderId,
    consumerId,
    restaurantId,
    lineItems,
    totalInCents,
    currency,
    paymentToken: 'tok_visa_4242',
  };
}

export function buildSagaInstance(
  step: PlaceOrderSagaStep = 'VERIFYING_CONSUMER',
): PlaceOrderSagaInstance {
  return {
    sagaId: '0199a5d0-0000-7000-8000-0000000000b1',
    state: { step, order: buildSagaOrder() },
    version: 0,
  };
}
