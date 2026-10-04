import { right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { Restaurant } from '#domain/restaurant/restaurant.aggregate.ts';
import type {
  OnboardRestaurantCommand,
  OnboardRestaurantError,
  OnboardedRestaurant,
} from './onboard-restaurant.command.ts';

export interface OnboardRestaurantDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export class OnboardRestaurantCommandHandler {
  readonly #dependencies: OnboardRestaurantDependencies;

  constructor(dependencies: OnboardRestaurantDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(
    command: OnboardRestaurantCommand,
  ): Promise<Either<OnboardRestaurantError, OnboardedRestaurant>> {
    const { unitOfWork, clock, idGenerator } = this.#dependencies;
    const restaurantId = idGenerator.generateRestaurantId();
    const restaurant = Restaurant.onboard({
      restaurantId,
      owner: command.principal.staffMemberId,
      profile: command.profile,
      onboardedAt: clock.now(),
    });
    if (restaurant.isLeft()) return restaurant;
    return unitOfWork.execute(command.metadata, async (scope) => {
      await scope.restaurants.save(restaurant.success);
      return right({ restaurantId });
    });
  }
}
