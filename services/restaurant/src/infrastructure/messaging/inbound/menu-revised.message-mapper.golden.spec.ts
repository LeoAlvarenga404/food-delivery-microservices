import { readGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { describe, expect, it } from 'vitest';
import { buildMenuRevisedMessage } from '../../../../test/support/menu-revised-message.builder.ts';
import { toProjectRestaurantCommand } from './menu-revised.message-mapper.ts';

describe('menu revised golden sample', () => {
  it('projects the MenuRevised sample the Restaurant service produces', async () => {
    const sample = await readGoldenSample({
      directory: goldenSamplesDirectory,
      topic: 'restaurant.restaurant.state',
      schema: MenuRevisedSchema,
    });

    expect(toProjectRestaurantCommand(buildMenuRevisedMessage(sample))).toEqual({
      restaurant: {
        restaurantId: '0199a5d0-0000-7000-8000-0000000000b1',
        version: 2,
        name: 'Pizzaria Bella',
        category: 'Pizza',
        address: {
          street: 'Avenida Paulista',
          number: '1000',
          city: 'Sao Paulo',
          postalCode: '01310-100',
          location: { latitude: -23.5614, longitude: -46.6559 },
        },
        timeZone: 'America/Sao_Paulo',
        openingHours: [
          { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' },
          { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
        ],
        minimumOrderInCents: 2000n,
        menuItems: [
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
