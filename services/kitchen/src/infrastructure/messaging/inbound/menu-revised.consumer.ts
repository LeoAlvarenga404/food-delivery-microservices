import type { MessageHandler } from '@fd/chassis-kafka';
import { withCorrelation, type Logger } from '@fd/chassis-observability';
import { ApplyMembershipRevisionCommandHandler } from '#application/commands/apply-membership-revision/apply-membership-revision.command-handler.ts';
import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import { toApplyMembershipRevisionCommand } from './menu-revised.message-mapper.ts';

export interface MenuRevisedConsumerSettings {
  readonly memberships: RestaurantMembershipRepository;
  readonly logger: Logger;
}

export function menuRevisedConsumer(settings: MenuRevisedConsumerSettings): MessageHandler {
  const applyMembershipRevision = new ApplyMembershipRevisionCommandHandler(settings.memberships);
  return async (message) => {
    const command = toApplyMembershipRevisionCommand(message);
    const { messageId, correlationId, causationId } = message.headers;
    const { restaurantId, version } = command.membership;
    const logger = withCorrelation(settings.logger, { correlationId, causationId, messageId });
    const outcome = await applyMembershipRevision.execute(command);
    const verdict = outcome.isLeft()
      ? 'restaurant membership ignored'
      : 'restaurant membership applied';
    logger.info({ restaurantId, version }, verdict);
  };
}
