import { describe, expect, it } from 'vitest';
import { isKebabCase } from './is-kebab-case.ts';

describe('isKebabCase', () => {
  it.each(['order', 'place-order', 'command-handler', 'v1', '0001-create-orders-table'])(
    'accepts %s',
    (segment) => {
      expect(isKebabCase(segment)).toBe(true);
    },
  );

  it.each(['Order', 'placeOrder', 'place_order', 'place--order', '-order', 'order-', ''])(
    'rejects %s',
    (segment) => {
      expect(isKebabCase(segment)).toBe(false);
    },
  );
});
