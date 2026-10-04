import type { DomainEvent } from '@fd/domain';
import type { MenuItem } from './menu-item.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { RestaurantProfile } from './restaurant-profile.value-object.ts';

export interface MenuRevised extends DomainEvent, RestaurantProfile {
  readonly eventType: 'MenuRevised';
  readonly restaurantId: RestaurantId;
  readonly version: number;
  readonly menuItems: readonly MenuItem[];
}
