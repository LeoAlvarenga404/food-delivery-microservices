import { InMemoryRestaurantMenuRepository } from './in-memory-restaurant-menu.repository.ts';
import { describeRestaurantMenuRepositoryContract } from './restaurant-menu-repository.contract.ts';

describeRestaurantMenuRepositoryContract('in-memory', () => new InMemoryRestaurantMenuRepository());
