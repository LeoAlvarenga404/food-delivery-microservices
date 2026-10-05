import { describe, expect, it } from 'vitest';
import { openCookieValue, sealCookieValue } from './encrypted-cookie.adapter.ts';

const secret = 'a-session-secret-of-at-least-32-characters';
const otherSecret = 'another-session-secret-of-32-characters';
const payload = {
  accessToken: 'eyJhbGciOiJSUzI1NiJ9.access.signature',
  expiresAtInMilliseconds: 7,
};

describe('sealCookieValue and openCookieValue', () => {
  it('opens what they sealed under the same secret and cookie name', () => {
    const sealed = sealCookieValue(secret, 'consumer-web-session', payload);

    expect(openCookieValue(secret, 'consumer-web-session', sealed)).toEqual(payload);
  });

  it('never shows the payload in the sealed value and seals it differently every time', () => {
    const first = sealCookieValue(secret, 'consumer-web-session', payload);
    const second = sealCookieValue(secret, 'consumer-web-session', payload);

    expect(first).not.toContain('eyJ');
    expect(Buffer.from(first, 'base64url').toString('latin1')).not.toContain('access');
    expect(first).not.toBe(second);
  });

  it('refuses a value sealed under another secret', () => {
    const sealed = sealCookieValue(otherSecret, 'consumer-web-session', payload);

    expect(openCookieValue(secret, 'consumer-web-session', sealed)).toBeUndefined();
  });

  it('refuses a value sealed for another cookie, so the login cookie cannot pose as the session', () => {
    const sealed = sealCookieValue(secret, 'consumer-web-login', payload);

    expect(openCookieValue(secret, 'consumer-web-session', sealed)).toBeUndefined();
  });

  it('refuses a value with one byte changed', () => {
    const bytes = Buffer.from(
      sealCookieValue(secret, 'consumer-web-session', payload),
      'base64url',
    );
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 1, bytes.length - 1);

    expect(
      openCookieValue(secret, 'consumer-web-session', bytes.toString('base64url')),
    ).toBeUndefined();
  });

  it.each([
    ['an empty value', ''],
    ['a value shorter than its header', 'c2hvcnQ'],
  ])('refuses %s', (description, sealed) => {
    expect(openCookieValue(secret, 'consumer-web-session', sealed)).toBeUndefined();
  });
});
