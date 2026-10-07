import { readFile, writeFile } from 'node:fs/promises';
import { createLogger } from '@fd/chassis-observability';
import { describe, expect, it } from 'vitest';
import { createRestaurantBffServer } from '../src/main.ts';
import { FakeRestaurantService } from './support/restaurant-service.fake.ts';
import { fakeServiceAccess } from './support/service-access.fake.ts';

const documentFile = new URL('../openapi.json', import.meta.url);

async function readServedDocument(): Promise<unknown> {
  const server = await createRestaurantBffServer({
    restaurantService: new FakeRestaurantService().client(),
    serviceAccess: fakeServiceAccess,
    logger: createLogger({ serviceName: 'restaurant-bff', level: 'silent' }),
    generateCorrelationId: () => '0199a5d0-0000-7000-8000-0000000000e9',
  });
  const response = await server.inject({ method: 'GET', url: '/openapi.json' });
  await server.close();
  return response.json();
}

describe('the committed OpenAPI document', () => {
  it('matches the document the server publishes, so restaurant-portal generates the right client', async () => {
    const served = await readServedDocument();
    if (process.env['UPDATE_GOLDEN'] === '1') {
      await writeFile(documentFile, `${JSON.stringify(served, null, 2)}\n`);
      return;
    }

    const committed: unknown = JSON.parse(await readFile(documentFile, 'utf8'));
    expect(
      served,
      'bffs/restaurant-bff/openapi.json (run with UPDATE_GOLDEN=1 to rewrite)',
    ).toEqual(committed);
  });
});
