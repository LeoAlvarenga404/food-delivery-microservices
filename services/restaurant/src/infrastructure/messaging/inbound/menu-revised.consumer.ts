import { TransientMessageFailure, type MessageHandler } from '@fd/chassis-kafka';
import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { ProjectRestaurantCommandHandler } from '#application/commands/project-restaurant/project-restaurant.command-handler.ts';
import {
  SearchIndexUnavailableError,
  type RestaurantSearchIndex,
} from '#application/ports/restaurant-search-index.port.ts';
import { toProjectRestaurantCommand } from './menu-revised.message-mapper.ts';

export interface MenuRevisedConsumerSettings {
  readonly searchIndex: RestaurantSearchIndex;
  readonly logger: Logger;
}

export function menuRevisedConsumer(settings: MenuRevisedConsumerSettings): MessageHandler {
  const projectRestaurant = new ProjectRestaurantCommandHandler(settings.searchIndex);
  return async (message) => {
    const command = toProjectRestaurantCommand(message);
    const { messageId, correlationId, causationId } = message.headers;
    const { restaurantId, version } = command.restaurant;
    const logger = withCorrelation(settings.logger, { correlationId, causationId, messageId });
    const outcome = await projectRestaurant.execute(command).catch((error: unknown) => {
      if (!(error instanceof SearchIndexUnavailableError)) throw error;
      throw new TransientMessageFailure('search index unavailable', { cause: error });
    });
    const verdict = outcome.isLeft() ? 'restaurant projection ignored' : 'restaurant projected';
    logger.info({ restaurantId, version }, verdict);
  };
}
