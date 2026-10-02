import { v7 as generateUuidV7 } from 'uuid';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import { parseOrderId, type OrderId } from '#domain/order/order-id.value-object.ts';

export class UuidV7IdGenerator implements IdGenerator {
  generateOrderId(): OrderId {
    const orderId = parseOrderId(generateUuidV7());
    if (orderId.isLeft()) throw new Error(`uuid generator produced ${orderId.failure.rawOrderId}`);
    return orderId.success;
  }

  generateSagaId(): string {
    return generateUuidV7();
  }
}
