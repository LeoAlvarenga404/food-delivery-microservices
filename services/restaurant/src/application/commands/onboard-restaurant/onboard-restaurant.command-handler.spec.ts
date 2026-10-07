import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../../test/support/id-generator.fake.ts';
import { InMemoryUnitOfWork } from '../../../../test/support/in-memory-unit-of-work.adapter.ts';
import {
  pizzeriaId,
  pizzeriaProfile,
  staffAId,
} from '../../../../test/support/restaurant.builder.ts';
import type { OnboardRestaurantCommand } from './onboard-restaurant.command.ts';
import { OnboardRestaurantCommandHandler } from './onboard-restaurant.command-handler.ts';

const onboardedAt = new Date('2026-10-04T12:00:00.000Z');
const metadataActorId = '0199a5d0-0000-7000-8000-0000000000a1';
const command: OnboardRestaurantCommand = {
  principal: { staffMemberId: staffAId },
  profile: pizzeriaProfile,
  metadata: {
    correlationId: '0199a5d0-0000-7000-8000-0000000000f1',
    causationId: undefined,
    actorId: metadataActorId,
    actorType: 'restaurant_staff',
  },
};

function handlerFor(unitOfWork: InMemoryUnitOfWork): OnboardRestaurantCommandHandler {
  return new OnboardRestaurantCommandHandler({
    unitOfWork,
    clock: new FakeClock(onboardedAt),
    idGenerator: new FakeIdGenerator(),
  });
}

describe('OnboardRestaurantCommandHandler', () => {
  it('onboards a restaurant owned by the principal and stores it at version one', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await handlerFor(unitOfWork).execute(command);

    expect(outcome).toEqual(right({ restaurantId: pizzeriaId }));
    expect((await unitOfWork.restaurants.findById(pizzeriaId))?.toSnapshot()).toEqual({
      restaurantId: pizzeriaId,
      ...pizzeriaProfile,
      menuItems: [],
      members: [{ staffMemberId: staffAId, role: 'OWNER' }],
      version: 1,
    });
    expect(unitOfWork.executedMetadata).toEqual([command.metadata]);
  });

  it('publishes the full public state as menu revision one', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    await handlerFor(unitOfWork).execute(command);

    expect(unitOfWork.publishedEvents).toEqual([
      {
        eventType: 'MenuRevised',
        occurredAt: onboardedAt,
        restaurantId: pizzeriaId,
        ...pizzeriaProfile,
        menuItems: [],
        version: 1,
      },
    ]);
  });

  it('refuses an invalid profile before opening a unit of work', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    const outcome = await handlerFor(unitOfWork).execute({
      ...command,
      profile: { ...pizzeriaProfile, category: ' ' },
    });

    expect(outcome).toEqual(left({ type: 'InvalidRestaurantCategory' }));
    expect(unitOfWork.executedMetadata).toEqual([]);
    expect(await unitOfWork.restaurants.findById(pizzeriaId)).toBeUndefined();
  });
});
