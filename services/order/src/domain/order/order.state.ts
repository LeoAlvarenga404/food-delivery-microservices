export type OrderRejectionReason =
  'CONSUMER_NOT_FOUND' | 'CONSUMER_BLOCKED' | 'TICKET_REFUSED' | 'PAYMENT_DECLINED';

export type OrderState =
  | { readonly status: 'APPROVAL_PENDING' }
  | { readonly status: 'APPROVED'; readonly approvedAt: Date }
  | {
      readonly status: 'REJECTED';
      readonly rejectionReason: OrderRejectionReason;
      readonly rejectedAt: Date;
    };

export type OrderStatus = OrderState['status'];
