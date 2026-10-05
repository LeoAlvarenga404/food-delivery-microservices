import { InMemoryRestaurantSearchIndex } from './in-memory-restaurant-search-index.adapter.ts';
import { describeRestaurantSearchIndexContract } from './restaurant-search-index.contract.ts';

describeRestaurantSearchIndexContract('in-memory', () =>
  Promise.resolve(new InMemoryRestaurantSearchIndex()),
);
