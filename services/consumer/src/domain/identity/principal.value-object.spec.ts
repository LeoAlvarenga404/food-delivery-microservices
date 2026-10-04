import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { parsePrincipal } from './principal.value-object.ts';

const consumerId = '0199a5d0-0000-7000-8000-0000000000c1';

describe('parsePrincipal', () => {
  it('reads a consumer from the subject of a caller with the consumer role', () => {
    expect(parsePrincipal({ subject: consumerId, roles: ['consumer'] })).toEqual(
      right({ consumerId }),
    );
  });

  it('keeps the consumer role among other roles', () => {
    expect(
      parsePrincipal({ subject: consumerId, roles: ['restaurant_staff', 'consumer'] }),
    ).toEqual(right({ consumerId }));
  });

  it('returns the consumer id in canonical lowercase form', () => {
    expect(parsePrincipal({ subject: consumerId.toUpperCase(), roles: ['consumer'] })).toEqual(
      right({ consumerId }),
    );
  });

  it.each([
    { scenario: 'only another role', roles: ['restaurant_staff'] },
    { scenario: 'no role', roles: [] },
    { scenario: 'only look-alike roles', roles: ['Consumer', 'consumer_admin'] },
  ])('refuses a caller with $scenario', ({ roles }) => {
    expect(parsePrincipal({ subject: consumerId, roles })).toEqual(
      left({ type: 'MissingConsumerRole' }),
    );
  });

  it('refuses a subject that is not a uuid', () => {
    expect(parsePrincipal({ subject: 'consumer-a', roles: ['consumer'] })).toEqual(
      left({ type: 'InvalidPrincipalSubject', subject: 'consumer-a' }),
    );
  });
});
