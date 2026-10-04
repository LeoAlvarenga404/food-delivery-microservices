import { PostgresUnitOfWork, type UnitOfWorkContext } from '@fd/chassis-outbox';
import type { Kysely } from 'kysely';
import type { TransactionScope } from '#application/ports/unit-of-work.port.ts';
import type { RestaurantEvent } from '#domain/restaurant/restaurant.aggregate.ts';
import type { RestaurantRepository } from '#domain/restaurant/restaurant.repository.ts';
import { toRestaurantEventMessages } from '#infrastructure/messaging/outbound/restaurant-event.message-mapper.ts';
import type { DB as RestaurantDatabase } from './generated/database.ts';
import { PostgresRestaurantRepository } from './postgres-restaurant.repository.ts';

export type RestaurantUnitOfWork = PostgresUnitOfWork<
  RestaurantDatabase,
  TransactionScope,
  RestaurantEvent
>;

export interface RestaurantUnitOfWorkSettings {
  readonly database: Kysely<RestaurantDatabase>;
  readonly generateMessageId: () => string;
  readonly now: () => Date;
}

function trackSavedRestaurants(
  restaurants: RestaurantRepository,
  track: UnitOfWorkContext<RestaurantDatabase, RestaurantEvent>['track'],
): RestaurantRepository {
  return {
    findById: (restaurantId) => restaurants.findById(restaurantId),
    findByMember: (staffMemberId) => restaurants.findByMember(staffMemberId),
    save: async (restaurant) => {
      await restaurants.save(restaurant);
      track(restaurant);
    },
  };
}

function createTransactionScope(
  context: UnitOfWorkContext<RestaurantDatabase, RestaurantEvent>,
): TransactionScope {
  return {
    restaurants: trackSavedRestaurants(
      new PostgresRestaurantRepository(context.transaction),
      context.track,
    ),
  };
}

export function createRestaurantUnitOfWork(
  settings: RestaurantUnitOfWorkSettings,
): RestaurantUnitOfWork {
  return new PostgresUnitOfWork({
    ...settings,
    createRepositories: createTransactionScope,
    toOutboxMessages: toRestaurantEventMessages,
  });
}
