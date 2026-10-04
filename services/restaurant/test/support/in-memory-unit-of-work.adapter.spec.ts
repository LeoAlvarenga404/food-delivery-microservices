import { left, right } from '@fd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.adapter.ts';
import { onboardRestaurant } from './restaurant.builder.ts';

const metadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000f1',
  causationId: undefined,
  actorId: undefined,
  actorType: undefined,
};

describe('InMemoryUnitOfWork', () => {
  it('publishes the events of the restaurants saved by work that succeeds', async () => {
    const unitOfWork = new InMemoryUnitOfWork();
    const restaurant = onboardRestaurant();

    await unitOfWork.execute(metadata, async (scope) => {
      await scope.restaurants.save(restaurant);
      return right(undefined);
    });

    expect(unitOfWork.publishedEvents.map((event) => event.version)).toEqual([1]);
  });

  it('publishes nothing for work that fails', async () => {
    const unitOfWork = new InMemoryUnitOfWork();

    await unitOfWork.execute(metadata, async (scope) => {
      await scope.restaurants.save(onboardRestaurant());
      return left('refused');
    });

    expect(unitOfWork.publishedEvents).toEqual([]);
  });
});
