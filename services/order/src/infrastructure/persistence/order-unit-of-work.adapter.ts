import { PostgresUnitOfWork, type UnitOfWorkContext } from '@fd/chassis-outbox';
import type { Kysely } from 'kysely';
import type { TransactionScope } from '#application/ports/unit-of-work.port.ts';
import type { OrderEvent } from '#domain/order/order.aggregate.ts';
import type { OrderRepository } from '#domain/order/order.repository.ts';
import { OutboxCommandSender } from '#infrastructure/messaging/outbound/outbox-command-sender.adapter.ts';
import { toOrderEventMessages } from '#infrastructure/messaging/outbound/order-event.message-mapper.ts';
import type { DB as OrderDatabase } from './generated/database.ts';
import { PostgresIdempotencyKeyStore } from './postgres-idempotency-key-store.adapter.ts';
import { PostgresOrderRepository } from './postgres-order.repository.ts';
import { PostgresPlaceOrderSagaRepository } from './postgres-place-order-saga.repository.ts';
import { PostgresRestaurantMenuRepository } from './postgres-restaurant-menu.repository.ts';

export type OrderUnitOfWork = PostgresUnitOfWork<OrderDatabase, TransactionScope, OrderEvent>;

export interface OrderUnitOfWorkSettings {
  readonly database: Kysely<OrderDatabase>;
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

function trackSavedOrders(
  orders: OrderRepository,
  track: UnitOfWorkContext<OrderDatabase, OrderEvent>['track'],
): OrderRepository {
  return {
    findById: (orderId) => orders.findById(orderId),
    save: async (order) => {
      await orders.save(order);
      track(order);
    },
  };
}

function createTransactionScope(
  context: UnitOfWorkContext<OrderDatabase, OrderEvent>,
): TransactionScope {
  const { transaction } = context;
  return {
    orders: trackSavedOrders(new PostgresOrderRepository(transaction), context.track),
    menus: new PostgresRestaurantMenuRepository(transaction),
    sagas: new PostgresPlaceOrderSagaRepository(transaction),
    idempotencyKeys: new PostgresIdempotencyKeyStore(transaction),
    commands: new OutboxCommandSender(context.enqueue),
  };
}

export function createOrderUnitOfWork(settings: OrderUnitOfWorkSettings): OrderUnitOfWork {
  return new PostgresUnitOfWork({
    ...settings,
    createRepositories: createTransactionScope,
    toOutboxMessages: toOrderEventMessages,
  });
}
