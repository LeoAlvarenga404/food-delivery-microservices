import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type PaymentId = Brand<string, 'PaymentId'>;

export interface InvalidPaymentId {
  readonly type: 'InvalidPaymentId';
  readonly rawPaymentId: string;
}

export function parsePaymentId(rawPaymentId: string): Either<InvalidPaymentId, PaymentId> {
  if (!isUuid(rawPaymentId)) return left({ type: 'InvalidPaymentId', rawPaymentId });
  return right(rawPaymentId.toLowerCase() as PaymentId);
}
