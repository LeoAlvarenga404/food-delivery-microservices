import { describe, expect, it } from 'vitest';
import { Entity } from './entity.ts';

class Seat extends Entity<string> {
  readonly #holder: string;

  constructor(seatNumber: string, holder: string) {
    super(seatNumber);
    this.#holder = holder;
  }

  describeHolder(): string {
    return this.#holder;
  }
}

describe('Entity', () => {
  it('treats entities with the same identity as the same entity even when their state differs', () => {
    const reserved = new Seat('12A', 'Ana');
    const reassigned = new Seat('12A', 'Bruno');

    expect(reserved.hasSameIdentityAs(reassigned)).toBe(true);
    expect(reserved.describeHolder()).not.toBe(reassigned.describeHolder());
  });

  it('tells entities with different identities apart', () => {
    expect(new Seat('12A', 'Ana').hasSameIdentityAs(new Seat('12B', 'Ana'))).toBe(false);
  });
});
