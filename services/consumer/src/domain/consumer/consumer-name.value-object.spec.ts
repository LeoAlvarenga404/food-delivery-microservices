import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parseConsumerName } from './consumer-name.value-object.ts';

describe('parseConsumerName', () => {
  it('accepts a name and trims the spaces around it', () => {
    expect(parseConsumerName('  Ana Souza ')).toEqual(right('Ana Souza'));
  });

  it('accepts a name of a single character', () => {
    expect(parseConsumerName('A')).toEqual(right('A'));
  });

  it('accepts a name of exactly one hundred characters', () => {
    expect(parseConsumerName('a'.repeat(100))).toEqual(right('a'.repeat(100)));
  });

  it.each([
    { scenario: 'an empty name', rawName: '' },
    { scenario: 'a name made of spaces', rawName: '   ' },
    { scenario: 'a name longer than one hundred characters', rawName: 'a'.repeat(101) },
    { scenario: 'a name with a control character', rawName: 'Ana\u0000Souza' },
  ])('refuses $scenario without echoing it', ({ rawName }) => {
    expect(parseConsumerName(rawName)).toEqual(left({ type: 'InvalidConsumerName' }));
  });
});
