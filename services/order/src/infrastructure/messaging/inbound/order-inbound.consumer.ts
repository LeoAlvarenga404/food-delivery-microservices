import { withInbox } from '@fd/chassis-inbox';
import type { MessageHandler } from '@fd/chassis-kafka';
import type { Logger } from '@fd/chassis-observability';
import type { Kysely } from 'kysely';
import type { Clock } from '#application/ports/clock.port.ts';
import type { PlaceOrderSagaTimeoutsInMilliseconds } from '#application/sagas/place-order/place-order-saga-deadline.saga.ts';
import type { DB as OrderDatabase } from '#infrastructure/persistence/generated/database.ts';
import type { OrderUnitOfWork } from '#infrastructure/persistence/order-unit-of-work.adapter.ts';
import { PostgresRestaurantMenuRepository } from '#infrastructure/persistence/postgres-restaurant-menu.repository.ts';
import { menuRevisedConsumer } from './menu-revised.consumer.ts';
import { placeOrderSagaReplyConsumer } from './place-order-saga-reply.consumer.ts';

export interface OrderInboundSettings {
  readonly database: Kysely<OrderDatabase>;
  readonly unitOfWork: OrderUnitOfWork;
  readonly clock: Clock;
  readonly sagaTimeoutsInMilliseconds: PlaceOrderSagaTimeoutsInMilliseconds;
  readonly logger: Logger;
}

export interface OrderInboundSubscription {
  readonly topics: readonly string[];
  readonly handle: MessageHandler;
}

const placeOrderSagaRepliesTopic = 'order.place-order-saga.replies';
const restaurantStateTopic = 'restaurant.restaurant.state';

export function orderInboundConsumer(settings: OrderInboundSettings): OrderInboundSubscription {
  const { database, clock, logger } = settings;
  const handleReply = withInbox(
    { database, handlerName: 'place-order-saga-reply', now: () => clock.now() },
    placeOrderSagaReplyConsumer(settings),
  );
  const menus = new PostgresRestaurantMenuRepository(database);
  const handleMenuRevision = menuRevisedConsumer({ menus, logger });
  return {
    topics: [placeOrderSagaRepliesTopic, restaurantStateTopic],
    handle: (message) =>
      message.topic === restaurantStateTopic ? handleMenuRevision(message) : handleReply(message),
  };
}
