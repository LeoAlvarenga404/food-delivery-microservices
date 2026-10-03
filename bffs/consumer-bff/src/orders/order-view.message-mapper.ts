import { OrderRejectionReason } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import {
  OrderStatus,
  type GetOrderResponse,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { z } from 'zod';

const amountInCentsSchema = z.string().regex(/^\d+$/);

export const orderViewSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(['APPROVAL_PENDING', 'APPROVED', 'REJECTED']),
  rejectionReason: z
    .enum(['CONSUMER_NOT_FOUND', 'CONSUMER_BLOCKED', 'TICKET_REFUSED', 'PAYMENT_DECLINED'])
    .optional(),
  lineItems: z.array(
    z.object({
      menuItemId: z.uuid(),
      name: z.string(),
      unitPriceInCents: amountInCentsSchema,
      quantity: z.int(),
    }),
  ),
  totalInCents: amountInCentsSchema,
  currency: z.string(),
});

export type OrderView = z.infer<typeof orderViewSchema>;

type RejectionReasonName = NonNullable<OrderView['rejectionReason']>;

function toStatusName(status: OrderStatus): OrderView['status'] {
  switch (status) {
    case OrderStatus.APPROVAL_PENDING:
      return 'APPROVAL_PENDING';
    case OrderStatus.APPROVED:
      return 'APPROVED';
    case OrderStatus.REJECTED:
      return 'REJECTED';
    case OrderStatus.UNSPECIFIED:
      throw new Error('the order service answered without an order status');
  }
}

function toRejectionReasonName(reason: OrderRejectionReason): RejectionReasonName {
  switch (reason) {
    case OrderRejectionReason.CONSUMER_NOT_FOUND:
      return 'CONSUMER_NOT_FOUND';
    case OrderRejectionReason.CONSUMER_BLOCKED:
      return 'CONSUMER_BLOCKED';
    case OrderRejectionReason.TICKET_REFUSED:
      return 'TICKET_REFUSED';
    case OrderRejectionReason.PAYMENT_DECLINED:
      return 'PAYMENT_DECLINED';
    case OrderRejectionReason.UNSPECIFIED:
      throw new Error('the order service answered a rejected order without a reason');
  }
  throw new Error('the order service answered an unknown rejection reason');
}

export function toOrderView(order: GetOrderResponse): OrderView {
  const status = toStatusName(order.status);
  return {
    orderId: order.orderId,
    status,
    ...(status === 'REJECTED' && { rejectionReason: toRejectionReasonName(order.rejectionReason) }),
    lineItems: order.lineItems.map(({ menuItemId, name, unitPriceInCents, quantity }) => ({
      menuItemId,
      name,
      unitPriceInCents: unitPriceInCents.toString(),
      quantity,
    })),
    totalInCents: order.totalInCents.toString(),
    currency: order.currency,
  };
}
