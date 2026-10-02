import type { OrderId } from '#domain/order/order-id.value-object.ts';

export interface GetOrderQuery {
  readonly orderId: OrderId;
}

export interface OrderNotFound {
  readonly type: 'OrderNotFound';
  readonly orderId: OrderId;
}
