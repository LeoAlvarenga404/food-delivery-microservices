import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  buildRestaurant,
  guarana,
  margherita,
  pizzeriaId,
  pizzeriaProfile,
  staffAId,
  staffBId,
  unwrap,
} from '../../../../test/support/restaurant.builder.ts';
import { parseRestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type { ReviseMenuCommand } from './revise-menu.command.ts';
import { ReviseMenuCommandHandler } from './revise-menu.command-handler.ts';

const revisedAt = new Date('2026-10-04T12:30:00.000Z');
const metadataActorId = '0199a5d0-0000-7000-8000-0000000000a1';
const command: ReviseMenuCommand = {
  principal: { staffMemberId: staffAId },
  restaurantId: pizzeriaId,
  menuItems: [guarana],
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000f1',
    causationId: undefined,
    actorId: metadataActorId,
    actorType: 'restaurant_staff',
  },
};

function handlerFor(unitOfWork: InMemoryUnitOfWork): ReviseMenuCommandHandler {
  return new ReviseMenuCommandHandler({ unitOfWork, clock: new FakeClock(revisedAt) });
}

describe('ReviseMenuCommandHandler', () => {
  it('replaces the menu of a restaurant the principal is a member of', async () => {
    const unitOfWork = new InMemoryUnitOfWork([buildRestaurant({ version: 1 })]);

    const outcome = await handlerFor(unitOfWork).execute(command);

    expect(outcome).toEqual(right({ version: 2 }));
    expect((await unitOfWork.restaurants.findById(pizzeriaId))?.toSnapshot()).toMatchObject({
      menuItems: [guarana],
      version: 2,
    });
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('publishes the full public state with the next version', async () => {
    const unitOfWork = new InMemoryUnitOfWork([buildRestaurant({ version: 1 })]);

    await handlerFor(unitOfWork).execute({ ...command, menuItems: [margherita, guarana] });

    expect(unitOfWork.publishedEvents).toEqual([
      {
        eventType: 'MenuRevised',
        occurredAt: revisedAt,
        restaurantId: pizzeriaId,
        ...pizzeriaProfile,
        menuItems: [margherita, guarana],
        version: 2,
      },
    ]);
  });

  it('refuses a staff member who is not a member and leaves the menu as it was', async () => {
    const stored = buildRestaurant({ version: 1 });
    const unitOfWork = new InMemoryUnitOfWork([stored]);

    const outcome = await handlerFor(unitOfWork).execute({
      ...command,
      principal: { staffMemberId: staffBId },
    });

    expect(outcome).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId: pizzeriaId, staffMemberId: staffBId }),
    );
    expect((await unitOfWork.restaurants.findById(pizzeriaId))?.toSnapshot()).toEqual(
      stored.toSnapshot(),
    );
    expect(unitOfWork.publishedEvents).toEqual([]);
  });

  it('answers a restaurant that was never onboarded as not found', async () => {
    const unknownRestaurantId = unwrap(parseRestaurantId('0199a5d0-0000-7000-8000-0000000000bf'));

    const outcome = await handlerFor(new InMemoryUnitOfWork()).execute({
      ...command,
      restaurantId: unknownRestaurantId,
    });

    expect(outcome).toEqual(
      left({ type: 'RestaurantNotFound', restaurantId: unknownRestaurantId }),
    );
  });

  it('refuses an invalid menu before opening a unit of work', async () => {
    const unitOfWork = new InMemoryUnitOfWork([buildRestaurant()]);

    const outcome = await handlerFor(unitOfWork).execute({
      ...command,
      menuItems: [guarana, guarana],
    });

    expect(outcome).toEqual(left({ type: 'DuplicateMenuItem', menuItemId: guarana.menuItemId }));
    expect(unitOfWork.executedMetadata).toEqual([]);
  });
});
