import { describe, expectTypeOf, it } from 'vitest';
import type { Brand } from './brand.ts';

type OrderId = Brand<string, 'OrderId'>;
type TicketId = Brand<string, 'TicketId'>;

describe('Brand', () => {
  it('keeps branded identifiers apart from plain strings and from each other', () => {
    expectTypeOf<string>().not.toExtend<OrderId>();
    expectTypeOf<TicketId>().not.toExtend<OrderId>();
    expectTypeOf<OrderId>().toExtend<string>();
  });
});
