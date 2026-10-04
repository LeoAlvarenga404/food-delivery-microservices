import { left, right, type Either } from '@fd/domain';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import type { ApplyMenuRevisionCommand, StaleMenuRevision } from './apply-menu-revision.command.ts';

export class ApplyMenuRevisionCommandHandler {
  readonly #menus: RestaurantMenuRepository;

  constructor(menus: RestaurantMenuRepository) {
    this.#menus = menus;
  }

  async execute(command: ApplyMenuRevisionCommand): Promise<Either<StaleMenuRevision, void>> {
    const { restaurantId, version } = command.menu;
    const wasSaved = await this.#menus.saveIfNewer(command.menu);
    if (!wasSaved) return left({ type: 'StaleMenuRevision', restaurantId, version });
    return right(undefined);
  }
}
