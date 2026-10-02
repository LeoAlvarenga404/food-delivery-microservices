import { left } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseOrderId } from './order-id.value-object.ts';

describe('parseOrderId', () => {
  it('accepts a UUID', () => {
    const parsed = parseOrderId('0199a5d0-0000-7000-8000-0000000000a1');

    expect(parsed.isRight()).toBe(true);
  });

  it.each(['', 'order-1', '0199a5d0-0000-7000-8000'])('rejects "%s"', (rawOrderId) => {
    expect(parseOrderId(rawOrderId)).toEqual(left({ type: 'InvalidOrderId', rawOrderId }));
  });
});
