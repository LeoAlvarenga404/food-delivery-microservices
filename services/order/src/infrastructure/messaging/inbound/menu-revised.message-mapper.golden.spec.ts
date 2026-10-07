import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import { buildMenuRevisedMessage } from '../../../../test/support/menu-revised-message.builder.ts';
import { toApplyMenuRevisionCommand } from './menu-revised.message-mapper.ts';

describe('menu revised golden sample', () => {
  it('reads the MenuRevised sample the Restaurant service produces', async () => {
    const sample = await readGoldenSample({
      directory: goldenSamplesDirectory,
      topic: 'restaurant.restaurant.state',
      schema: MenuRevisedSchema,
    });

    expect(toApplyMenuRevisionCommand(buildMenuRevisedMessage(sample))).toEqual({
      menu: {
        restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
        version: 2,
        openingHours: {
          timeZone: 'America/Sao_Paulo',
          periods: [
            { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' },
            { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
          ],
        },
        minimumOrderInCents: 2000n,
        items: [
          {
            menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
            name: 'Margherita',
            priceInCents: 4500n,
            isAvailable: true,
          },
          {
            menuItemId: '0199a5d0-0000-7000-8000-000000000d02',
            name: 'Guarana',
            priceInCents: 800n,
            isAvailable: false,
          },
        ],
      },
    });
  });
});
