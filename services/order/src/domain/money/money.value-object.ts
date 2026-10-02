export type Currency = 'BRL';

export interface MoneySnapshot {
  readonly amountInCents: bigint;
  readonly currency: Currency;
}

export class Money {
  readonly #amountInCents: bigint;
  readonly #currency: Currency;

  private constructor(amountInCents: bigint, currency: Currency) {
    this.#amountInCents = amountInCents;
    this.#currency = currency;
  }

  static of(amountInCents: bigint, currency: Currency): Money {
    return new Money(amountInCents, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  add(other: Money): Money {
    return new Money(this.#amountInCents + other.#amountInCents, this.#currency);
  }

  multiply(factor: number): Money {
    return new Money(this.#amountInCents * BigInt(factor), this.#currency);
  }

  equals(other: Money): boolean {
    return this.#amountInCents === other.#amountInCents;
  }

  toSnapshot(): MoneySnapshot {
    return { amountInCents: this.#amountInCents, currency: this.#currency };
  }
}
