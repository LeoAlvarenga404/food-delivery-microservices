import type { Selectable } from 'kysely';
import type {
  AfterPivotSagaState,
  BeforePivotSagaState,
  CompensationSagaState,
  PlaceOrderSagaInstance,
  PlaceOrderSagaOrder,
  PlaceOrderSagaState,
} from '#application/sagas/place-order/place-order.saga-state.ts';
import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { Currency } from '#domain/money/money.value-object.ts';
import type { ConsumerId } from '#domain/order/consumer-id.value-object.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderRejectionReason } from '#domain/order/order.state.ts';
import type { JsonObject, SagaInstances } from './generated/database.ts';

export type SagaInstanceRow = Selectable<SagaInstances>;

interface StoredLineItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly unitPriceInCents: string;
  readonly quantity: number;
}

interface StoredSagaOrder {
  readonly orderId: string;
  readonly consumerId: string;
  readonly restaurantId: string;
  readonly lineItems: readonly StoredLineItem[];
  readonly totalInCents: string;
  readonly currency: string;
}

interface StoredSagaState {
  readonly step: string;
  readonly order: StoredSagaOrder;
  readonly paymentToken?: string;
  readonly rejectionReason?: string;
}

const placeOrderSagaType = 'PlaceOrderSaga';

function toStoredOrder(order: PlaceOrderSagaOrder): JsonObject {
  return {
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
  };
}

function toStoredState(state: PlaceOrderSagaState): JsonObject {
  return { ...state, order: toStoredOrder(state.order) };
}

function toSagaOrder(stored: StoredSagaOrder): PlaceOrderSagaOrder {
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
  };
}

function toSagaState(stored: StoredSagaState): PlaceOrderSagaState {
  const order = toSagaOrder(stored.order);
  if (stored.paymentToken !== undefined) {
    const step = stored.step as BeforePivotSagaState['step'];
    return { step, order, paymentToken: stored.paymentToken };
  }
  if (stored.rejectionReason !== undefined) {
    const step = stored.step as CompensationSagaState['step'];
    return { step, order, rejectionReason: stored.rejectionReason as OrderRejectionReason };
  }
  return { step: stored.step as AfterPivotSagaState['step'], order };
}

function toSagaStatus(state: PlaceOrderSagaState): string {
  if (state.step === 'COMPLETED' || state.step === 'COMPENSATED') return state.step;
  return 'RUNNING';
}

export const placeOrderSagaPersistenceMapper = {
  toDomain(row: SagaInstanceRow): PlaceOrderSagaInstance {
    return {
      sagaId: row.sagaId,
      state: toSagaState(row.state as unknown as StoredSagaState),
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
      status: toSagaStatus(state),
      deadlineAt: null,
      version: instance.version,
    };
  },
};
