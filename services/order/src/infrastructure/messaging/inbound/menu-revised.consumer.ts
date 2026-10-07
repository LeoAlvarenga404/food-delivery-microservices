import type { MessageHandler } from '@fd/chassis-kafka';
import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { ApplyMenuRevisionCommandHandler } from '#application/commands/apply-menu-revision/apply-menu-revision.command-handler.ts';
import type { RestaurantMenuRepository } from '#domain/menu/restaurant-menu.repository.ts';
import { toApplyMenuRevisionCommand } from './menu-revised.message-mapper.ts';

export interface MenuRevisedConsumerSettings {
  readonly menus: RestaurantMenuRepository;
  readonly logger: Logger;
}

export function menuRevisedConsumer(settings: MenuRevisedConsumerSettings): MessageHandler {
  const applyMenuRevision = new ApplyMenuRevisionCommandHandler(settings.menus);
  return async (message) => {
    const command = toApplyMenuRevisionCommand(message);
    const { messageId, correlationId, causationId } = message.headers;
    const { restaurantId, version } = command.menu;
    const logger = withCorrelation(settings.logger, { correlationId, causationId, messageId });
    const outcome = await applyMenuRevision.execute(command);
    const verdict = outcome.isLeft() ? 'menu revision ignored' : 'menu revision applied';
    logger.info({ restaurantId, version }, verdict);
  };
}
