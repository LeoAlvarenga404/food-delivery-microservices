import { left, right, type Either } from '@fd/domain';
import type { RestaurantSearchIndex } from '#application/ports/restaurant-search-index.port.ts';
import type {
  ProjectRestaurantCommand,
  StaleRestaurantProjection,
} from './project-restaurant.command.ts';

export class ProjectRestaurantCommandHandler {
  readonly #searchIndex: RestaurantSearchIndex;

  constructor(searchIndex: RestaurantSearchIndex) {
    this.#searchIndex = searchIndex;
  }

  async execute(
    command: ProjectRestaurantCommand,
  ): Promise<Either<StaleRestaurantProjection, undefined>> {
    const { restaurantId, version } = command.restaurant;
    const wasSaved = await this.#searchIndex.save(command.restaurant);
    if (!wasSaved) return left({ type: 'StaleRestaurantProjection', restaurantId, version });
    return right(undefined);
  }
}
