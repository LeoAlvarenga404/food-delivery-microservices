import type { RestaurantId } from './restaurant-id.value-object.ts';
import type { Restaurant } from './restaurant.aggregate.ts';
import type { StaffMemberId } from './staff-member-id.value-object.ts';

export interface RestaurantRepository {
  findById(restaurantId: RestaurantId): Promise<Restaurant | undefined>;
  findByMember(staffMemberId: StaffMemberId): Promise<readonly Restaurant[]>;
  findAll(): Promise<readonly Restaurant[]>;
  save(restaurant: Restaurant): Promise<void>;
}
