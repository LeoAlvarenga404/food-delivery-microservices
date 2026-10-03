import { describe, expect, it } from 'vitest';
import { UuidV7IdGenerator } from './uuid-v7-id-generator.adapter.ts';

describe('UuidV7IdGenerator', () => {
  it('generates version 7 uuids', () => {
    expect(new UuidV7IdGenerator().generateOrderId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('keeps ids generated within the same millisecond in creation order', () => {
    const generator = new UuidV7IdGenerator();

    const sagaIds = Array.from({ length: 1000 }, () => generator.generateSagaId());

    expect(sagaIds).toEqual(sagaIds.toSorted());
  });
});
