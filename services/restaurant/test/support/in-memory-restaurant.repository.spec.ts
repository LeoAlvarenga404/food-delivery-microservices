import { describeRestaurantRepositoryContract } from './restaurant-repository.contract.ts';
import { InMemoryRestaurantRepository } from './in-memory-restaurant.repository.ts';

describeRestaurantRepositoryContract('in-memory', (storedRestaurants) =>
  Promise.resolve(new InMemoryRestaurantRepository(storedRestaurants)),
);
