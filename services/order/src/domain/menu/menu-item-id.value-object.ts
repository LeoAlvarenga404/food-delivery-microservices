import { isUuid, left, right, type Brand, type Either } from '@fd/domain';

export type MenuItemId = Brand<string, 'MenuItemId'>;

export interface InvalidMenuItemId {
  readonly type: 'InvalidMenuItemId';
  readonly rawMenuItemId: string;
}

export function parseMenuItemId(rawMenuItemId: string): Either<InvalidMenuItemId, MenuItemId> {
  if (!isUuid(rawMenuItemId)) return left({ type: 'InvalidMenuItemId', rawMenuItemId });
  return right(rawMenuItemId as MenuItemId);
}
