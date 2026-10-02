import { describe, expect, it } from 'vitest';
import { parseOrderId } from '#domain/order/order-id.value-object.ts';
import { FakeIdGenerator } from './id-generator.fake.ts';

describe('FakeIdGenerator', () => {
  it('keeps generating valid distinct uuids past fifteen ids', () => {
    const generator = new FakeIdGenerator();

    const orderIds = Array.from({ length: 20 }, () => generator.generateOrderId());
    const sagaIds = Array.from({ length: 20 }, () => generator.generateSagaId());

    expect(orderIds.every((orderId) => parseOrderId(orderId).isRight())).toBe(true);
    expect(sagaIds.every((sagaId) => parseOrderId(sagaId).isRight())).toBe(true);
    expect(new Set([...orderIds, ...sagaIds]).size).toBe(40);
  });
});
