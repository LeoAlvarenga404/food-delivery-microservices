import type { DomainEvent } from '@fd/domain';
import type { OrderId } from './order-id.value-object.ts';
import type { OrderRejectionReason } from './order.state.ts';

export interface OrderRejected extends DomainEvent {
  readonly eventType: 'OrderRejected';
  readonly orderId: OrderId;
  readonly rejectionReason: OrderRejectionReason;
}
