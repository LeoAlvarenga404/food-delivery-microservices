import { left, right, type Brand, type Either } from '@fd/domain';

export type Email = Brand<string, 'Email'>;

export interface InvalidEmail {
  readonly type: 'InvalidEmail';
}

const maximumEmailLength = 254;
const emailPattern = /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+\.[^\s@\p{Cc}]+$/u;

export function parseEmail(rawEmail: string): Either<InvalidEmail, Email> {
  const email = rawEmail.trim().toLowerCase();
  if (email.length > maximumEmailLength || !emailPattern.test(email)) {
    return left({ type: 'InvalidEmail' });
  }
  return right(email as Email);
}
