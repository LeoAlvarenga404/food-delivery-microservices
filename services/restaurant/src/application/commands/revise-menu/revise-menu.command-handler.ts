import { left, right, type Either } from '@fd/domain';
import type { Clock } from '#application/ports/clock.port.ts';
import type { TransactionScope, UnitOfWork } from '#application/ports/unit-of-work.port.ts';
import { parseMenu, type Menu } from '#domain/restaurant/menu.value-object.ts';
import type { ReviseMenuCommand, ReviseMenuError, RevisedMenu } from './revise-menu.command.ts';

export interface ReviseMenuDependencies {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
}

export class ReviseMenuCommandHandler {
  readonly #dependencies: ReviseMenuDependencies;

  constructor(dependencies: ReviseMenuDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(command: ReviseMenuCommand): Promise<Either<ReviseMenuError, RevisedMenu>> {
    const menu = parseMenu(command.menuItems);
    if (menu.isLeft()) return menu;
    return this.#dependencies.unitOfWork.execute(command.metadata, (scope) =>
      this.#revise(scope, command, menu.success),
    );
  }

  async #revise(
    scope: TransactionScope,
    command: ReviseMenuCommand,
    menu: Menu,
  ): Promise<Either<ReviseMenuError, RevisedMenu>> {
    const { restaurantId, principal } = command;
    const restaurant = await scope.restaurants.findById(restaurantId);
    if (restaurant === undefined) return left({ type: 'RestaurantNotFound', restaurantId });
    const revisedAt = this.#dependencies.clock.now();
    const revision = restaurant.reviseMenu(principal.staffMemberId, menu, revisedAt);
    if (revision.isLeft()) return revision;
    await scope.restaurants.save(restaurant);
    return right({ version: restaurant.toSnapshot().version + 1 });
  }
}
