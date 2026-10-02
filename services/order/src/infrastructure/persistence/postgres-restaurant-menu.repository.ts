import type { Kysely } from 'kysely';
import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import type { DB as OrderDatabase } from './generated/database.ts';
import { restaurantMenuPersistenceMapper } from './restaurant-menu.persistence-mapper.ts';

export class PostgresRestaurantMenuRepository implements RestaurantMenuRepository {
  readonly #database: Kysely<OrderDatabase>;

  constructor(database: Kysely<OrderDatabase>) {
    this.#database = database;
  }

  async findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMenu | undefined> {
    const rows = await this.#database
      .selectFrom('menuItems')
      .selectAll()
      .where('restaurantId', '=', restaurantId)
      .orderBy('menuItemId')
      .execute();
    if (rows.length === 0) return undefined;
    return restaurantMenuPersistenceMapper.toDomain(restaurantId, rows);
  }
}
