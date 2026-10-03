import {
  OrderStatus,
  type GetOrderResponse,
} from '@fd/contracts/fooddelivery/order/v1/service_pb.js';
import { z } from 'zod';

const amountInCentsSchema = z.string().regex(/^\d+$/);

export const orderViewSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(['APPROVAL_PENDING', 'APPROVED', 'REJECTED']),
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

export function toOrderView(order: GetOrderResponse): OrderView {
  return {
    orderId: order.orderId,
    status: toStatusName(order.status),
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
