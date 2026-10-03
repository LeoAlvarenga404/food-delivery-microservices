import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Order } from '#domain/order/order.aggregate.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';
import type { OrderRepository } from '#domain/order/order.repository.ts';
import {
  orderPersistenceMapper,
  type OrderRows,
} from '#infrastructure/persistence/order.persistence-mapper.ts';

export class InMemoryOrderRepository implements OrderRepository {
  readonly rows = new Map<string, OrderRows>();

  findById(orderId: OrderId): Promise<Order | undefined> {
    const stored = this.rows.get(orderId);
    return Promise.resolve(
      stored === undefined ? undefined : orderPersistenceMapper.toDomain(stored),
    );
  }

  save(order: Order): Promise<void> {
    const snapshot = order.toSnapshot();
    const storedVersion = this.rows.get(snapshot.orderId)?.order.version ?? 0;
    if (storedVersion !== snapshot.version) {
      return Promise.reject(new ConcurrencyConflictError(`order ${snapshot.orderId} changed`));
    }
    const rows = orderPersistenceMapper.toPersistence(snapshot);
    this.rows.set(snapshot.orderId, {
      ...rows,
      order: { ...rows.order, version: snapshot.version + 1 },
    });
    return Promise.resolve();
  }
}
