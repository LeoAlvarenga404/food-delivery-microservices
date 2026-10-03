import type { RestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import {
  restaurantMenuPersistenceMapper,
  type MenuItemRow,
} from '#infrastructure/persistence/restaurant-menu.persistence-mapper.ts';
import { pizzeriaMenu } from './order.builder.ts';

export class InMemoryRestaurantMenuRepository implements RestaurantMenuRepository {
  readonly rows: readonly MenuItemRow[];

  constructor(menus: readonly RestaurantMenu[] = [pizzeriaMenu]) {
    this.rows = menus.flatMap((menu) => restaurantMenuPersistenceMapper.toPersistence(menu));
  }

  findByRestaurantId(restaurantId: RestaurantId): Promise<RestaurantMenu | undefined> {
    const rows = this.rows.filter((row) => row.restaurantId === restaurantId);
    return Promise.resolve(
      rows.length === 0 ? undefined : restaurantMenuPersistenceMapper.toDomain(restaurantId, rows),
    );
  }
}
