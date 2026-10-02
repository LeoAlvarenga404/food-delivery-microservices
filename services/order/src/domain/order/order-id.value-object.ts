import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type OrderId = Brand<string, 'OrderId'>;

export interface InvalidOrderId {
  readonly type: 'InvalidOrderId';
  readonly rawOrderId: string;
}

export function parseOrderId(rawOrderId: string): Either<InvalidOrderId, OrderId> {
  if (!isUuid(rawOrderId)) return left({ type: 'InvalidOrderId', rawOrderId });
  return right(rawOrderId.toLowerCase() as OrderId);
}
