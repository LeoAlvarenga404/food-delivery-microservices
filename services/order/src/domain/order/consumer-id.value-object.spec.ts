import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseConsumerId } from './consumer-id.value-object.ts';

describe('parseConsumerId', () => {
  it('accepts a UUID', () => {
    expect(parseConsumerId('0199a5d0-0000-7000-8000-0000000000a1').isRight()).toBe(true);
  });

  it('returns the canonical lowercase form', () => {
    expect(parseConsumerId('0199A5D0-0000-7000-8000-0000000000A1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000a1'),
    );
  });

  it.each(['', 'x-1', '0199a5d0-0000-7000-8000'])('rejects "%s"', (rawConsumerId) => {
    expect(parseConsumerId(rawConsumerId)).toEqual(
      left({ type: 'InvalidConsumerId', rawConsumerId }),
    );
  });
});
