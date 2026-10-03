export type OrderState =
  | { readonly status: 'APPROVAL_PENDING' }
  | { readonly status: 'APPROVED'; readonly approvedAt: Date };

export type OrderStatus = OrderState['status'];
