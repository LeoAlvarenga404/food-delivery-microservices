import { describe, expect, it } from 'vitest';
import { toSafeReturnPath } from './keycloak-login.adapter.ts';

const publicUrl = 'http://localhost:8080';

describe('toSafeReturnPath', () => {
  it.each([
    ['/cart', '/cart'],
    [
      '/orders/0199a5d0-0000-7000-8000-0000000000a7?from=checkout',
      '/orders/0199a5d0-0000-7000-8000-0000000000a7?from=checkout',
    ],
    ['profile', '/profile'],
  ])('keeps the path %s of this site', (returnTo, expected) => {
    expect(toSafeReturnPath(returnTo, publicUrl)).toBe(expected);
  });

  it.each([
    ['no return path', null],
    ['another origin', 'https://evil.example/cart'],
    ['a protocol-relative URL', '//evil.example/cart'],
    ['dot segments that leave two leading slashes', '/.//evil.example/cart'],
    ['a parent segment that leaves two leading slashes', '/orders/..//evil.example'],
    ['a tab the URL parser removes', '/\t/evil.example/cart'],
    ['another scheme', 'javascript:alert(1)'],
  ])('goes home for %s', (description, returnTo) => {
    expect(toSafeReturnPath(returnTo, publicUrl)).toBe('/');
  });
});
