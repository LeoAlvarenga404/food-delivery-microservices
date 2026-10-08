import { InMemoryRestaurantMembershipRepository } from './in-memory-restaurant-membership.repository.ts';
import { describeRestaurantMembershipRepositoryContract } from './restaurant-membership-repository.contract.ts';

describeRestaurantMembershipRepositoryContract(
  'in-memory',
  () => new InMemoryRestaurantMembershipRepository(),
);
