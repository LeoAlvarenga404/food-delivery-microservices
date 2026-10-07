import { left, right, type Brand, type Either } from '@fd/domain';

export type ConsumerName = Brand<string, 'ConsumerName'>;

export interface InvalidConsumerName {
  readonly type: 'InvalidConsumerName';
}

const maximumNameLength = 100;
const controlCharacterPattern = /\p{Cc}/u;

export function parseConsumerName(rawName: string): Either<InvalidConsumerName, ConsumerName> {
  const name = rawName.trim();
  if (name.length === 0 || name.length > maximumNameLength || controlCharacterPattern.test(name)) {
    return left({ type: 'InvalidConsumerName' });
  }
  return right(name as ConsumerName);
}
