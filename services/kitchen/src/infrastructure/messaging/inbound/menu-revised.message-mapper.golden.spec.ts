import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import { buildMenuRevisedMessage } from '../../../../test/support/menu-revised-message.builder.ts';
import { toApplyMembershipRevisionCommand } from './menu-revised.message-mapper.ts';

describe('restaurant state golden samples', () => {
  it('reads the members of the MenuRevised sample the Restaurant service produces', async () => {
    const sample = await readGoldenSample({
      directory: goldenSamplesDirectory,
      topic: 'restaurant.restaurant.state',
      schema: MenuRevisedSchema,
    });

    expect(toApplyMembershipRevisionCommand(buildMenuRevisedMessage(sample))).toEqual({
      membership: {
        restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
        version: 2,
        staffMemberIds: ['0199a5d0-0000-7000-8000-0000000000e1'],
      },
    });
  });
});
