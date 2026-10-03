import type { OrderId } from './order-id.value-object.ts';
import type { Payment } from './payment.aggregate.ts';

export interface PaymentRepository {
  findByOrderId(orderId: OrderId): Promise<Payment | undefined>;
  save(payment: Payment): Promise<void>;
}
