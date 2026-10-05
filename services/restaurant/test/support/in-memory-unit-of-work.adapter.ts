import type { Either } from '@fd/domain';
import type {
  MessageMetadata,
  TransactionScope,
  TransactionalWork,
  UnitOfWork,
} from '#application/ports/unit-of-work.port.ts';
import type { Restaurant, RestaurantEvent } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantRows } from '#infrastructure/persistence/restaurant.persistence-mapper.ts';
import { InMemoryRestaurantRepository } from './in-memory-restaurant.repository.ts';

function restoreRows(
  table: Map<string, RestaurantRows>,
  savedRows: ReadonlyMap<string, RestaurantRows>,
): void {
  table.clear();
  savedRows.forEach((rows, restaurantId) => table.set(restaurantId, rows));
}

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
    const rollBack = this.#takeSavepoint();
    try {
      const outcome = await work(this.#scopeTracking(savedRestaurants));
      if (outcome.isLeft()) rollBack();
      else
        this.publishedEvents.push(
          ...savedRestaurants.flatMap((saved) => saved.pullRecordedEvents()),
        );
      return outcome;
    } catch (error) {
      rollBack();
      throw error;
    }
  }

  #scopeTracking(savedRestaurants: Restaurant[]): TransactionScope {
    return {
      restaurants: {
        findById: (restaurantId) => this.restaurants.findById(restaurantId),
        findByMember: (staffMemberId) => this.restaurants.findByMember(staffMemberId),
        findAll: () => this.restaurants.findAll(),
        save: async (restaurant) => {
          await this.restaurants.save(restaurant);
          savedRestaurants.push(restaurant);
        },
      },
    };
  }

  #takeSavepoint(): () => void {
    const savedRows = new Map(this.restaurants.rows);
    return () => {
      restoreRows(this.restaurants.rows, savedRows);
    };
  }
}
