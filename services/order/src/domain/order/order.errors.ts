import type { MenuItemId } from '#domain/menu/menu-item-id.value-object.ts';
import type { OrderStatus } from './order.state.ts';

export interface EmptyOrder {
  readonly type: 'EmptyOrder';
}

export interface InvalidQuantity {
  readonly type: 'InvalidQuantity';
  readonly menuItemId: MenuItemId;
  readonly quantity: number;
}

export interface UnknownMenuItem {
  readonly type: 'UnknownMenuItem';
  readonly menuItemId: MenuItemId;
}

export interface UnavailableMenuItem {
  readonly type: 'UnavailableMenuItem';
  readonly menuItemId: MenuItemId;
}

export interface DuplicateMenuItem {
  readonly type: 'DuplicateMenuItem';
  readonly menuItemId: MenuItemId;
}

export interface IncompleteDeliveryAddress {
  readonly type: 'IncompleteDeliveryAddress';
}

export interface RestaurantClosed {
  readonly type: 'RestaurantClosed';
}

export interface MinimumOrderNotReached {
  readonly type: 'MinimumOrderNotReached';
}

export type OrderPlacementError =
  | EmptyOrder
  | InvalidQuantity
  | UnknownMenuItem
  | UnavailableMenuItem
  | DuplicateMenuItem
  | IncompleteDeliveryAddress
  | RestaurantClosed
  | MinimumOrderNotReached;

export interface InvalidOrderTransition {
  readonly type: 'InvalidOrderTransition';
  readonly from: OrderStatus;
  readonly to: OrderStatus;
}
