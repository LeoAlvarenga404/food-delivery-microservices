import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, it } from 'vitest';
import {
  buildRestaurant,
  guarana,
  margherita,
  menuOf,
  staffAId,
  unwrap,
} from '../../../../test/support/restaurant.builder.ts';
import { toMenuRevisedContract } from './restaurant-event.message-mapper.ts';

describe('restaurant event golden samples', () => {
  it('produces the MenuRevised sample', async () => {
    const restaurant = buildRestaurant({ version: 1 });
    unwrap(
      restaurant.reviseMenu(
        staffAId,
        menuOf([margherita, guarana]),
        new Date('2026-10-04T12:30:00.000Z'),
      ),
    );
    const [revised] = restaurant.pullRecordedEvents();
    if (revised === undefined) throw new Error('expected MenuRevised');

    await expectGoldenSample(
      {
        directory: goldenSamplesDirectory,
        topic: 'restaurant.restaurant.state',
        schema: MenuRevisedSchema,
      },
      toMenuRevisedContract(revised),
    );
  });
});
