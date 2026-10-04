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
    const row = await this.#database
      .selectFrom('restaurantMenus')
      .selectAll()
      .where('restaurantId', '=', restaurantId)
      .executeTakeFirst();
    return row === undefined ? undefined : restaurantMenuPersistenceMapper.toDomain(row);
  }

  async saveIfNewer(menu: RestaurantMenu): Promise<boolean> {
    const row = restaurantMenuPersistenceMapper.toPersistence(menu);
    const saved = await this.#database
      .insertInto('restaurantMenus')
      .values({
        ...row,
        openingHours: JSON.stringify(row.openingHours),
        menuItems: JSON.stringify(row.menuItems),
      })
      .onConflict((conflict) =>
        conflict
          .column('restaurantId')
          .doUpdateSet((update) => ({
            version: update.ref('excluded.version'),
            timeZone: update.ref('excluded.timeZone'),
            openingHours: update.ref('excluded.openingHours'),
            minimumOrderInCents: update.ref('excluded.minimumOrderInCents'),
            menuItems: update.ref('excluded.menuItems'),
          }))
          .whereRef('restaurantMenus.version', '<', 'excluded.version'),
      )
      .returning('restaurantId')
      .executeTakeFirst();
    return saved !== undefined;
  }
}
