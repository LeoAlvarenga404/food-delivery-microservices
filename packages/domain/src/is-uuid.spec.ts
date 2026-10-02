import { describe, expect, it } from 'vitest';
import { isUuid } from './is-uuid.ts';

describe('isUuid', () => {
  it.each(['0199a5d0-0000-7000-8000-000000000001', '0199A5D0-0000-7000-8000-00000000000F'])(
    'accepts %s',
    (text) => {
      expect(isUuid(text)).toBe(true);
    },
  );

  it.each([
    '',
    'margherita',
    '0199a5d0-0000-7000-8000-00000000000',
    '0199a5d0000070008000000000000001',
  ])('rejects "%s"', (text) => {
    expect(isUuid(text)).toBe(false);
  });
});
