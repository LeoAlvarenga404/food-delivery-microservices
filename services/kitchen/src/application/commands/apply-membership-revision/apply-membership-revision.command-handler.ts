import { left, right, type Either } from '@fd/domain';
import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import type {
  ApplyMembershipRevisionCommand,
  StaleMembershipRevision,
} from './apply-membership-revision.command.ts';

export class ApplyMembershipRevisionCommandHandler {
  readonly #memberships: RestaurantMembershipRepository;

  constructor(memberships: RestaurantMembershipRepository) {
    this.#memberships = memberships;
  }

  async execute(
    command: ApplyMembershipRevisionCommand,
  ): Promise<Either<StaleMembershipRevision, undefined>> {
    const { restaurantId, version } = command.membership;
    const wasSaved = await this.#memberships.saveIfNewer(command.membership);
    if (!wasSaved) return left({ type: 'StaleMembershipRevision', restaurantId, version });
    return right(undefined);
  }
}
