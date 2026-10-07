import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { Principal } from '#domain/identity/principal.value-object.ts';
import type { RawMenuItem } from '#domain/restaurant/menu-item.value-object.ts';
import type { InvalidMenu } from '#domain/restaurant/menu.value-object.ts';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type {
  NotRestaurantMember,
  RestaurantNotFound,
} from '#domain/restaurant/restaurant.errors.ts';

export interface ReviseMenuCommand {
  readonly principal: Principal;
  readonly restaurantId: RestaurantId;
  readonly menuItems: readonly RawMenuItem[];
  readonly metadata: MessageMetadata;
}

export type ReviseMenuError = InvalidMenu | RestaurantNotFound | NotRestaurantMember;

export interface RevisedMenu {
  readonly version: number;
}
