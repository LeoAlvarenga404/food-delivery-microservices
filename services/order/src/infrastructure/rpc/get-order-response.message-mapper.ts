import { create } from '@bufbuild/protobuf';
import {
  GetOrderResponseSchema,
  OrderStatus,
  type GetOrderResponse,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { OrderSnapshot } from '#domain/order/order.aggregate.ts';
import type { OrderStatus as DomainOrderStatus } from '#domain/order/order.state.ts';

const contractStatusByDomainStatus: Readonly<Record<DomainOrderStatus, OrderStatus>> = {
  APPROVAL_PENDING: OrderStatus.APPROVAL_PENDING,
  APPROVED: OrderStatus.APPROVED,
  REJECTED: OrderStatus.REJECTED,
};

export function toGetOrderResponse(snapshot: OrderSnapshot): GetOrderResponse {
  return create(GetOrderResponseSchema, {
    orderId: snapshot.orderId,
    status: contractStatusByDomainStatus[snapshot.state.status],
    lineItems: snapshot.lineItems.map(({ menuItemId, name, unitPriceInCents, quantity }) => ({
      menuItemId,
      name,
      unitPriceInCents,
      quantity,
    })),
    totalInCents: snapshot.totalInCents,
    currency: snapshot.currency,
  });
}
