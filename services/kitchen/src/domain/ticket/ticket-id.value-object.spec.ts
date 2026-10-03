import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseTicketId } from './ticket-id.value-object.ts';

describe('parseTicketId', () => {
  it('accepts a UUID', () => {
    expect(parseTicketId('0199a5d0-0000-7000-8000-0000000000f1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000f1'),
    );
  });

  it('returns the canonical lowercase form', () => {
    expect(parseTicketId('0199A5D0-0000-7000-8000-0000000000F1')).toEqual(
      right('0199a5d0-0000-7000-8000-0000000000f1'),
    );
  });

  it.each([
    '',
    'ticket-1',
    '0199a5d0-0000-7000-8000',
    'x0199a5d0-0000-7000-8000-0000000000f1',
    '0199a5d0-0000-7000-8000-0000000000f1x',
  ])('rejects "%s"', (rawTicketId) => {
    expect(parseTicketId(rawTicketId)).toEqual(left({ type: 'InvalidTicketId', rawTicketId }));
  });
});
