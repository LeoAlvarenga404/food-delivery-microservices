import { left, right, type Either } from '@fd/domain';
import type { OrderSnapshot } from '#domain/order/order.aggregate.ts';
import type { OrderRepository } from '#domain/order/order.repository.ts';
import type { GetOrderQuery, OrderNotFound } from './get-order.query.ts';

export class GetOrderQueryHandler {
  readonly #orders: OrderRepository;

  constructor(orders: OrderRepository) {
    this.#orders = orders;
  }

  async execute(query: GetOrderQuery): Promise<Either<OrderNotFound, OrderSnapshot>> {
    const order = await this.#orders.findById(query.orderId);
    if (order === undefined) return left({ type: 'OrderNotFound', orderId: query.orderId });
    return right(order.toSnapshot());
  }
}
