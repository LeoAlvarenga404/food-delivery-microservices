import { left, right, type Either } from '@fd/domain';

export type Currency = 'BRL';

export interface Money {
  readonly amountInCents: bigint;
  readonly currency: Currency;
}

export interface InvalidMoney {
  readonly type: 'InvalidMoney';
  readonly amountInCents: bigint;
  readonly currency: string;
}

export function parseMoney(amountInCents: bigint, currency: string): Either<InvalidMoney, Money> {
  if (amountInCents < 0n || currency !== 'BRL') {
    return left({ type: 'InvalidMoney', amountInCents, currency });
  }
  return right({ amountInCents, currency });
}
