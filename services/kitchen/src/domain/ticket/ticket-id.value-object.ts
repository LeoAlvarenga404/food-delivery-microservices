import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type TicketId = Brand<string, 'TicketId'>;

export interface InvalidTicketId {
  readonly type: 'InvalidTicketId';
  readonly rawTicketId: string;
}

export function parseTicketId(rawTicketId: string): Either<InvalidTicketId, TicketId> {
  if (!isUuid(rawTicketId)) return left({ type: 'InvalidTicketId', rawTicketId });
  return right(rawTicketId.toLowerCase() as TicketId);
}
