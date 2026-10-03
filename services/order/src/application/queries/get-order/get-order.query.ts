import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { OrderId } from '#domain/order/order-id.value-object.ts';

export interface GetOrderQuery {
  readonly orderId: OrderId;
  readonly principal: Principal;
}

export interface OrderNotFound {
  readonly type: 'OrderNotFound';
  readonly orderId: OrderId;
}
