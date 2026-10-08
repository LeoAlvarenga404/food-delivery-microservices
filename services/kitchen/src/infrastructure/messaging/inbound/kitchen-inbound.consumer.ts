import { withInbox } from '@fd/chassis-inbox';
import type { MessageHandler } from '@fd/chassis-kafka';
import type { Logger } from '@fd/chassis-observability';
import type { Kysely } from 'kysely';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import type { DB as KitchenDatabase } from '#infrastructure/persistence/generated/database.ts';
import type { KitchenUnitOfWork } from '#infrastructure/persistence/kitchen-unit-of-work.adapter.ts';
import { PostgresRestaurantMembershipRepository } from '#infrastructure/persistence/postgres-restaurant-membership.repository.ts';
import { kitchenCommandConsumer } from './kitchen-command.consumer.ts';
import { menuRevisedConsumer } from './menu-revised.consumer.ts';

export interface KitchenInboundSettings {
  readonly database: Kysely<KitchenDatabase>;
  readonly unitOfWork: KitchenUnitOfWork;
  readonly idGenerator: IdGenerator;
  readonly now: () => Date;
  readonly logger: Logger;
}

export interface KitchenInboundSubscription {
  readonly topics: readonly string[];
  readonly handle: MessageHandler;
}

const kitchenCommandsTopic = 'kitchen.commands';
const restaurantStateTopic = 'restaurant.restaurant.state';

export function kitchenInboundConsumer(
  settings: KitchenInboundSettings,
): KitchenInboundSubscription {
  const { database, now, logger } = settings;
  const handleCommand = withInbox(
    { database, handlerName: 'kitchen-command', now },
    kitchenCommandConsumer(settings),
  );
  const memberships = new PostgresRestaurantMembershipRepository(database);
  const handleMenuRevision = menuRevisedConsumer({ memberships, logger });
  return {
    topics: [kitchenCommandsTopic, restaurantStateTopic],
    handle: (message) =>
      message.topic === restaurantStateTopic ? handleMenuRevision(message) : handleCommand(message),
  };
}
