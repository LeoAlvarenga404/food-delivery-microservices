import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type { Restaurant } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import type { StaffMemberId } from '#domain/restaurant/staff-member-id.value-object.ts';
import {
  restaurantPersistenceMapper,
  type RestaurantRows,
} from '#infrastructure/persistence/restaurant.persistence-mapper.ts';

export class InMemoryRestaurantRepository implements RestaurantRepository {
  readonly #rows = new Map<string, RestaurantRows>();

  constructor(storedRestaurants: readonly Restaurant[] = []) {
    for (const restaurant of storedRestaurants) {
      const rows = restaurantPersistenceMapper.toPersistence(restaurant);
      this.#rows.set(rows.restaurant.restaurantId, rows);
    }
  }

  findById(restaurantId: RestaurantId): Promise<Restaurant | undefined> {
    const stored = this.#rows.get(restaurantId);
    return Promise.resolve(
      stored === undefined ? undefined : restaurantPersistenceMapper.toDomain(stored),
    );
  }

  findByMember(staffMemberId: StaffMemberId): Promise<readonly Restaurant[]> {
    const memberRows = [...this.#rows.values()].filter((stored) =>
      stored.members.some((member) => member.staffMemberId === staffMemberId),
    );
    return Promise.resolve(
      memberRows
        .toSorted((first, second) =>
          first.restaurant.restaurantId.localeCompare(second.restaurant.restaurantId),
        )
        .map((stored) => restaurantPersistenceMapper.toDomain(stored)),
    );
  }

  save(restaurant: Restaurant): Promise<void> {
    const rows = restaurantPersistenceMapper.toPersistence(restaurant);
    const { restaurantId, version } = rows.restaurant;
    if ((this.#rows.get(restaurantId)?.restaurant.version ?? 0) !== version) {
      return Promise.reject(new ConcurrencyConflictError(`restaurant ${restaurantId} changed`));
    }
    this.#rows.set(restaurantId, {
      ...rows,
      restaurant: { ...rows.restaurant, version: version + 1 },
    });
    return Promise.resolve();
  }
}
