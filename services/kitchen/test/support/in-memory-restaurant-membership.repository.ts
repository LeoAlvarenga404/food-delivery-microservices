import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import type { RestaurantMembership } from '#domain/membership/restaurant-membership.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import {
  restaurantMembershipPersistenceMapper,
  type RestaurantMembershipRow,
} from '#infrastructure/persistence/restaurant-membership.persistence-mapper.ts';

export class InMemoryRestaurantMembershipRepository implements RestaurantMembershipRepository {
  readonly rows = new Map<string, RestaurantMembershipRow>();

  constructor(memberships: readonly RestaurantMembership[] = []) {
    memberships.forEach((membership) => {
      this.rows.set(
        membership.restaurantId,
        restaurantMembershipPersistenceMapper.toPersistence(membership),
      );
    });
  }

  findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMembership | undefined> {
    const row = this.rows.get(restaurantId);
    return Promise.resolve(
      row === undefined ? undefined : restaurantMembershipPersistenceMapper.toDomain(row),
    );
  }

  saveIfNewer(membership: RestaurantMembership): Promise<boolean> {
    const stored = this.rows.get(membership.restaurantId);
    if (stored !== undefined && stored.version >= membership.version) {
      return Promise.resolve(false);
    }
    this.rows.set(
      membership.restaurantId,
      restaurantMembershipPersistenceMapper.toPersistence(membership),
    );
    return Promise.resolve(true);
  }
}
