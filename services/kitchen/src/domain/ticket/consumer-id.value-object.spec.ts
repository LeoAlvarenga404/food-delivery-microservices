import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseConsumerId } from './consumer-id.value-object.ts';

describe('parseConsumerId', () => {
  it('returns the canonical lowercase form of a UUID', () => {
    expect(parseConsumerId('0199A5D0-0000-7000-8000-0000000000C1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000c1'),
    );
  });

  it.each(['', 'consumer-1', '0199a5d0-0000-7000-8000-0000000000c1x'])(
    'rejects "%s"',
    (rawConsumerId) => {
      expect(parseConsumerId(rawConsumerId)).toEqual(
        left({ type: 'InvalidConsumerId', rawConsumerId }),
      );
    },
  );
});
