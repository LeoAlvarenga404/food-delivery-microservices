import type { OrderId } from '#domain/order/order-id.value-object.ts';

export interface IdGenerator {
  generateOrderId(): OrderId;
  generateSagaId(): string;
}
