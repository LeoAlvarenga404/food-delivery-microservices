import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseEmail } from './email.value-object.ts';

const longestLocalPart = 'a'.repeat(254 - '@food-delivery.test'.length);

describe('parseEmail', () => {
  it('returns the canonical lowercase form without surrounding spaces', () => {
    expect(parseEmail(' Ana.Souza@Food-Delivery.TEST ')).toEqual(
      right('ana.souza@food-delivery.test'),
    );
  });

  it('accepts an email of exactly 254 characters', () => {
    expect(parseEmail(`${longestLocalPart}@food-delivery.test`)).toEqual(
      right(`${longestLocalPart}@food-delivery.test`),
    );
  });

  it.each([
    { scenario: 'an empty email', rawEmail: '' },
    { scenario: 'an email without an at sign', rawEmail: 'ana.food-delivery.test' },
    { scenario: 'an email without a domain dot', rawEmail: 'ana@localhost' },
    { scenario: 'an email with two at signs', rawEmail: 'ana@souza@food-delivery.test' },
    { scenario: 'an email with a space inside', rawEmail: 'ana souza@food-delivery.test' },
    {
      scenario: 'an email longer than 254 characters',
      rawEmail: `a${longestLocalPart}@food-delivery.test`,
    },
  ])('refuses $scenario without echoing it', ({ rawEmail }) => {
    expect(parseEmail(rawEmail)).toEqual(left({ type: 'InvalidEmail' }));
  });
});
