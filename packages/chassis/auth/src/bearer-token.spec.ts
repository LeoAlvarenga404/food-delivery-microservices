import { describe, expect, it } from 'vitest';
import { readBearerToken } from './bearer-token.ts';

describe('readBearerToken', () => {
  it('reads the token of a bearer authorization', () => {
    expect(readBearerToken('Bearer eyJhbGciOiJSUzI1NiJ9.e30.c2lnbmF0dXJl')).toBe(
      'eyJhbGciOiJSUzI1NiJ9.e30.c2lnbmF0dXJl',
    );
  });

  it('accepts several spaces after the scheme', () => {
    expect(readBearerToken('Bearer  header.payload.signature')).toBe('header.payload.signature');
  });

  it('accepts the scheme in any case', () => {
    expect(readBearerToken('bearer header.payload.signature')).toBe('header.payload.signature');
  });

  it.each([
    { scenario: 'a missing header', authorization: undefined },
    { scenario: 'an absent header', authorization: null },
    { scenario: 'an empty header', authorization: '' },
    { scenario: 'another scheme', authorization: 'Basic Y29uc3VtZXItYmZmOnNlY3JldA==' },
    { scenario: 'a scheme without a token', authorization: 'Bearer ' },
    { scenario: 'two tokens', authorization: 'Bearer first second' },
    { scenario: 'a bearer token after another scheme', authorization: 'Basic Bearer token' },
  ])('reads no token from $scenario', ({ authorization }) => {
    expect(readBearerToken(authorization)).toBeUndefined();
  });
});
