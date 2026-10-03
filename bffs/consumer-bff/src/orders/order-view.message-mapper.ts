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
    .enum([
      'CONSUMER_NOT_FOUND',
      'CONSUMER_BLOCKED',
      'TICKET_REFUSED',
      'PAYMENT_DECLINED',
      'CONSUMER_VERIFICATION_TIMED_OUT',
      'TICKET_CREATION_TIMED_OUT',
      'PAYMENT_AUTHORIZATION_TIMED_OUT',
    ])
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

const rejectionReasonNames = new Map<OrderRejectionReason, RejectionReasonName>([
  [OrderRejectionReason.CONSUMER_NOT_FOUND, 'CONSUMER_NOT_FOUND'],
  [OrderRejectionReason.CONSUMER_BLOCKED, 'CONSUMER_BLOCKED'],
  [OrderRejectionReason.TICKET_REFUSED, 'TICKET_REFUSED'],
  [OrderRejectionReason.PAYMENT_DECLINED, 'PAYMENT_DECLINED'],
  [OrderRejectionReason.CONSUMER_VERIFICATION_TIMED_OUT, 'CONSUMER_VERIFICATION_TIMED_OUT'],
  [OrderRejectionReason.TICKET_CREATION_TIMED_OUT, 'TICKET_CREATION_TIMED_OUT'],
  [OrderRejectionReason.PAYMENT_AUTHORIZATION_TIMED_OUT, 'PAYMENT_AUTHORIZATION_TIMED_OUT'],
]);

function toRejectionReasonName(reason: OrderRejectionReason): RejectionReasonName {
  if (reason === OrderRejectionReason.UNSPECIFIED) {
    throw new Error('the order service answered a rejected order without a reason');
  }
  const name = rejectionReasonNames.get(reason);
  if (name === undefined) throw new Error('the order service answered an unknown rejection reason');
  return name;
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
