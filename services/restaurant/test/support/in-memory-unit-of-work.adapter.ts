import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import type { Restaurant, RestaurantEvent } from '#domain/restaurant/restaurant.aggregate.ts';
import { InMemoryRestaurantRepository } from './in-memory-restaurant.repository.ts';

export class InMemoryUnitOfWork implements UnitOfWork {
  readonly restaurants: InMemoryRestaurantRepository;
  readonly publishedEvents: RestaurantEvent[] = [];
  readonly executedMetadata: MessageMetadata[] = [];

  constructor(storedRestaurants: readonly Restaurant[] = []) {
    this.restaurants = new InMemoryRestaurantRepository(storedRestaurants);
  }

  async execute<Failure, Success>(
    metadata: MessageMetadata,
    work: TransactionalWork<Failure, Success>,
  ): Promise<Either<Failure, Success>> {
    this.executedMetadata.push(metadata);
    const savedRestaurants: Restaurant[] = [];
    const scope: TransactionScope = {
      restaurants: {
        findById: (restaurantId) => this.restaurants.findById(restaurantId),
        findByMember: (staffMemberId) => this.restaurants.findByMember(staffMemberId),
        save: async (restaurant) => {
          await this.restaurants.save(restaurant);
          savedRestaurants.push(restaurant);
        },
      },
    };
    const outcome = await work(scope);
    if (outcome.isRight()) {
      this.publishedEvents.push(...savedRestaurants.flatMap((saved) => saved.pullRecordedEvents()));
    }
    return outcome;
  }
}
