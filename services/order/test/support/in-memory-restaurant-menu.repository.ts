import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import {
  restaurantMenuPersistenceMapper,
  type RestaurantMenuRow,
} from '#infrastructure/persistence/restaurant-menu.persistence-mapper.ts';
import { pizzeriaMenu } from './order.builder.ts';

export class InMemoryRestaurantMenuRepository implements RestaurantMenuRepository {
  readonly rows = new Map<string, RestaurantMenuRow>();

  constructor(menus: readonly RestaurantMenu[] = [pizzeriaMenu]) {
    menus.forEach((menu) => {
      this.rows.set(menu.restaurantId, restaurantMenuPersistenceMapper.toPersistence(menu));
    });
  }

  findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMenu | undefined> {
    const row = this.rows.get(restaurantId);
    return Promise.resolve(
      row === undefined ? undefined : restaurantMenuPersistenceMapper.toDomain(row),
    );
  }

  saveIfNewer(menu: RestaurantMenu): Promise<boolean> {
    const stored = this.rows.get(menu.restaurantId);
    if (stored !== undefined && stored.version >= menu.version) return Promise.resolve(false);
    this.rows.set(menu.restaurantId, restaurantMenuPersistenceMapper.toPersistence(menu));
    return Promise.resolve(true);
  }
}
