import type { Selectable } from 'kysely';
import type {
  PlaceOrderSagaInstance,
  PlaceOrderSagaOrder,
  PlaceOrderSagaState,
} from '#application/sagas/place-order/place-order.saga-state.ts';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from '#domain/order/consumer-id.value-object.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { JsonObject, SagaInstances } from './generated/database.ts';

export type SagaInstanceRow = Selectable<SagaInstances>;

interface StoredLineItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly unitPriceInCents: string;
  readonly quantity: number;
}

interface StoredSagaState {
  readonly step: string;
  readonly order: {
    readonly orderId: string;
    readonly consumerId: string;
    readonly restaurantId: string;
    readonly lineItems: readonly StoredLineItem[];
    readonly totalInCents: string;
    readonly currency: string;
    readonly paymentToken: string;
  };
}

const placeOrderSagaType = 'PlaceOrderSaga';

function toStoredState(state: PlaceOrderSagaState): JsonObject {
  const { order } = state;
  return {
    step: state.step,
    order: {
      orderId: order.orderId,
      consumerId: order.consumerId,
      restaurantId: order.restaurantId,
      lineItems: order.lineItems.map((lineItem) => ({
        menuItemId: lineItem.menuItemId,
        name: lineItem.name,
        unitPriceInCents: lineItem.unitPriceInCents.toString(),
        quantity: lineItem.quantity,
      })),
      totalInCents: order.totalInCents.toString(),
      currency: order.currency,
      paymentToken: order.paymentToken,
    },
  };
}

function toSagaOrder(stored: StoredSagaState['order']): PlaceOrderSagaOrder {
  return {
    orderId: stored.orderId as OrderId,
    consumerId: stored.consumerId as ConsumerId,
    restaurantId: stored.restaurantId as RestaurantId,
    lineItems: stored.lineItems.map((lineItem) => ({
      menuItemId: lineItem.menuItemId as MenuItemId,
      name: lineItem.name,
      unitPriceInCents: BigInt(lineItem.unitPriceInCents),
      quantity: lineItem.quantity,
    })),
    totalInCents: BigInt(stored.totalInCents),
    currency: stored.currency as Currency,
    paymentToken: stored.paymentToken,
  };
}

export const placeOrderSagaPersistenceMapper = {
  toDomain(row: SagaInstanceRow): PlaceOrderSagaInstance {
    const stored = row.state as unknown as StoredSagaState;
    return {
      sagaId: row.sagaId,
      state: { step: stored.step as PlaceOrderSagaState['step'], order: toSagaOrder(stored.order) },
      version: row.version,
    };
  },

  toPersistence(instance: PlaceOrderSagaInstance): SagaInstanceRow {
    const { state } = instance;
    return {
      sagaId: instance.sagaId,
      sagaType: placeOrderSagaType,
      orderId: state.order.orderId,
      step: state.step,
      state: toStoredState(state),
      status: state.step === 'COMPLETED' ? 'COMPLETED' : 'RUNNING',
      deadlineAt: null,
      version: instance.version,
    };
  },
};
