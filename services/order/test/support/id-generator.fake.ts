import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import { parseOrderId, type OrderId } from '#domain/order/order-id.value-object.ts';
import { unwrap } from './order.builder.ts';

function sequentialUuid(prefix: string, sequenceNumber: number): string {
  return `0199a5d0-0000-7000-8000-0000000000${prefix}${sequenceNumber.toString(16)}`;
}

export class FakeIdGenerator implements IdGenerator {
  #orderCount = 0;
  #sagaCount = 0;

  generateOrderId(): OrderId {
    this.#orderCount += 1;
    return unwrap(parseOrderId(sequentialUuid('a', this.#orderCount)));
  }

  generateSagaId(): string {
    this.#sagaCount += 1;
    return sequentialUuid('b', this.#sagaCount);
  }
}
