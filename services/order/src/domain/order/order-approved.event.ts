import type { DomainEvent } from '@fd/domain';
import type { OrderId } from './order-id.value-object.ts';

export interface OrderApproved extends DomainEvent {
  readonly eventType: 'OrderApproved';
  readonly orderId: OrderId;
}
