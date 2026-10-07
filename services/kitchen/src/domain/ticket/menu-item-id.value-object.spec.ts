import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseMenuItemId } from './menu-item-id.value-object.ts';

describe('parseMenuItemId', () => {
  it('returns the canonical lowercase form of a UUID', () => {
    expect(parseMenuItemId('0199A5D0-0000-7000-8000-000000000101')).toEqual(
      right('0199a5d0-0000-7000-8000-000000000101'),
    );
  });

  it.each(['', 'menu-item-1', '0199a5d0-0000-7000-8000-000000000101x'])(
    'rejects "%s"',
    (rawMenuItemId) => {
      expect(parseMenuItemId(rawMenuItemId)).toEqual(
        left({ type: 'InvalidMenuItemId', rawMenuItemId }),
      );
    },
  );
});
