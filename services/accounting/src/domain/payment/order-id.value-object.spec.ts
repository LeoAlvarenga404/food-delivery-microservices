import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseOrderId } from './order-id.value-object.ts';

describe('parseOrderId', () => {
  it('accepts a UUID', () => {
    expect(parseOrderId('0199a5d0-0000-7000-8000-0000000000a1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000a1'),
    );
  });

  it('returns the canonical lowercase form', () => {
    expect(parseOrderId('0199A5D0-0000-7000-8000-0000000000A1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000a1'),
    );
  });

  it.each([
    '',
    'order-1',
    '0199a5d0-0000-7000-8000',
    'x0199a5d0-0000-7000-8000-0000000000a1',
    '0199a5d0-0000-7000-8000-0000000000a1x',
  ])('rejects "%s"', (rawOrderId) => {
    expect(parseOrderId(rawOrderId)).toEqual(left({ type: 'InvalidOrderId', rawOrderId }));
  });
});
