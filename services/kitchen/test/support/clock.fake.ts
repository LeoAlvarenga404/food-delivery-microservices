import type { Clock } from '#application/ports/clock.port.ts';

export class FakeClock implements Clock {
  readonly #now: Date;

  constructor(now = new Date('2026-10-06T18:00:00.000Z')) {
    this.#now = now;
  }

  now(): Date {
    return this.#now;
  }
}
