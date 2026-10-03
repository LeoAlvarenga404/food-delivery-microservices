import { create } from '@bufbuild/protobuf';
import { OrderRejectionReason as ContractRejectionReason } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import {
  GetOrderResponseSchema,
  OrderStatus,
  type GetOrderResponse,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import type { OrderSnapshot } from '#domain/order/order.aggregate.ts';
import type { OrderState, OrderStatus as DomainOrderStatus } from '#domain/order/order.state.ts';
import { toContractRejectionReason } from '#infrastructure/messaging/outbound/order-event.message-mapper.ts';

const contractStatusByDomainStatus: Readonly<Record<DomainOrderStatus, OrderStatus>> = {
  APPROVAL_PENDING: OrderStatus.APPROVAL_PENDING,
  APPROVED: OrderStatus.APPROVED,
  REJECTED: OrderStatus.REJECTED,
};

function toRejectionReason(state: OrderState): ContractRejectionReason {
  if (state.status !== 'REJECTED') return ContractRejectionReason.UNSPECIFIED;
  return toContractRejectionReason(state.rejectionReason);
}

export function toGetOrderResponse(snapshot: OrderSnapshot): GetOrderResponse {
  return create(GetOrderResponseSchema, {
    orderId: snapshot.orderId,
    status: contractStatusByDomainStatus[snapshot.state.status],
    rejectionReason: toRejectionReason(snapshot.state),
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
