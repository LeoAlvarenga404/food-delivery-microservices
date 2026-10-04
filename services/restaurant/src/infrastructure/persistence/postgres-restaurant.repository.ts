import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import type { Kysely } from 'kysely';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type { Restaurant } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import type { StaffMemberId } from '#domain/restaurant/staff-member-id.value-object.ts';
import type { DB as RestaurantDatabase } from './generated/database.ts';
import {
  restaurantPersistenceMapper,
  type RestaurantRows,
} from './restaurant.persistence-mapper.ts';

export class PostgresRestaurantRepository implements RestaurantRepository {
  readonly #database: Kysely<RestaurantDatabase>;

  constructor(database: Kysely<RestaurantDatabase>) {
    this.#database = database;
  }

  findById(restaurantId: RestaurantId): Promise<Restaurant | undefined> {
    return this.#find(restaurantId);
  }

  async findByMember(staffMemberId: StaffMemberId): Promise<readonly Restaurant[]> {
    const memberships = await this.#database
      .selectFrom('restaurantMembers')
      .select('restaurantId')
      .where('staffMemberId', '=', staffMemberId)
      .orderBy('restaurantId')
      .execute();
    const restaurants = await Promise.all(
      memberships.map(({ restaurantId }) => this.#find(restaurantId)),
    );
    return restaurants.filter((restaurant) => restaurant !== undefined);
  }

  async #find(restaurantId: string): Promise<Restaurant | undefined> {
    const restaurant = await this.#database
      .selectFrom('restaurants')
      .selectAll()
      .where('restaurantId', '=', restaurantId)
      .executeTakeFirst();
    if (restaurant === undefined) return undefined;
    const members = await this.#database
      .selectFrom('restaurantMembers')
      .selectAll()
      .where('restaurantId', '=', restaurantId)
      .orderBy('staffMemberId')
      .execute();
    const menuItems = await this.#database
      .selectFrom('menuItems')
      .selectAll()
      .where('restaurantId', '=', restaurantId)
      .orderBy('position')
      .execute();
    return restaurantPersistenceMapper.toDomain({ restaurant, members, menuItems });
  }

  async save(restaurant: Restaurant): Promise<void> {
    const rows = restaurantPersistenceMapper.toPersistence(restaurant);
    if (rows.restaurant.version === 0) {
      await this.#insert(rows);
    } else {
      await this.#update(rows);
    }
    await this.#replaceChildren(rows);
  }

  async #insert(rows: RestaurantRows): Promise<void> {
    await this.#database
      .insertInto('restaurants')
      .values({
        ...rows.restaurant,
        openingHours: JSON.stringify(rows.restaurant.openingHours),
        version: 1,
      })
      .execute()
      .catch((error: unknown) => {
        throw ConcurrencyConflictError.fromUniqueViolation(
          error,
          `restaurant ${rows.restaurant.restaurantId} already exists`,
        );
      });
  }

  async #update(rows: RestaurantRows): Promise<void> {
    const { restaurantId, version } = rows.restaurant;
    const result = await this.#database
      .updateTable('restaurants')
      .set({
        ...rows.restaurant,
        openingHours: JSON.stringify(rows.restaurant.openingHours),
        version: version + 1,
      })
      .where('restaurantId', '=', restaurantId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new ConcurrencyConflictError(
        `restaurant ${restaurantId} changed after version ${String(version)}`,
      );
    }
  }

  async #replaceChildren(rows: RestaurantRows): Promise<void> {
    const { restaurantId } = rows.restaurant;
    await this.#database
      .deleteFrom('restaurantMembers')
      .where('restaurantId', '=', restaurantId)
      .execute();
    await this.#database.deleteFrom('menuItems').where('restaurantId', '=', restaurantId).execute();
    if (rows.members.length > 0) {
      await this.#database.insertInto('restaurantMembers').values(rows.members).execute();
    }
    if (rows.menuItems.length > 0) {
      await this.#database.insertInto('menuItems').values(rows.menuItems).execute();
    }
  }
}
