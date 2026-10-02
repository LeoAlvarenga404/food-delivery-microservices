import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type ConsumerId = Brand<string, 'ConsumerId'>;

export interface InvalidConsumerId {
  readonly type: 'InvalidConsumerId';
  readonly rawConsumerId: string;
}

export function parseConsumerId(rawConsumerId: string): Either<InvalidConsumerId, ConsumerId> {
  if (!isUuid(rawConsumerId)) return left({ type: 'InvalidConsumerId', rawConsumerId });
  return right(rawConsumerId.toLowerCase() as ConsumerId);
}
