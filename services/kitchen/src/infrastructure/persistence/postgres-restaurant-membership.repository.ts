import type { Kysely } from 'kysely';
import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import type { RestaurantMembership } from '#domain/membership/restaurant-membership.value-object.ts';
import type { RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';
import type { DB as KitchenDatabase } from './generated/database.ts';
import { restaurantMembershipPersistenceMapper } from './restaurant-membership.persistence-mapper.ts';

export class PostgresRestaurantMembershipRepository implements RestaurantMembershipRepository {
  readonly #database: Kysely<KitchenDatabase>;

  constructor(database: Kysely<KitchenDatabase>) {
    this.#database = database;
  }

  async findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMembership | undefined> {
    const row = await this.#database
      .selectFrom('restaurantMemberships')
      .selectAll()
      .where('restaurantId', '=', restaurantId)
      .executeTakeFirst();
    return row === undefined ? undefined : restaurantMembershipPersistenceMapper.toDomain(row);
  }

  async saveIfNewer(membership: RestaurantMembership): Promise<boolean> {
    const row = restaurantMembershipPersistenceMapper.toPersistence(membership);
    const savedRow = await this.#database
      .insertInto('restaurantMemberships')
      .values({ ...row, staffMemberIds: JSON.stringify(row.staffMemberIds) })
      .onConflict((conflict) =>
        conflict
          .column('restaurantId')
          .doUpdateSet((update) => ({
            version: update.ref('excluded.version'),
            staffMemberIds: update.ref('excluded.staffMemberIds'),
          }))
          .whereRef('restaurantMemberships.version', '<', 'excluded.version'),
      )
      .returning('restaurantId')
      .executeTakeFirst();
    return savedRow !== undefined;
  }
}
