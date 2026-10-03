import type { OrderId } from './order-id.value-object.ts';
import type { Order } from './order.aggregate.ts';

export interface OrderRepository {
  findById(orderId: OrderId): Promise<Order | undefined>;
  save(order: Order): Promise<void>;
}
