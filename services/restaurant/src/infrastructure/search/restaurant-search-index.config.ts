import type { API } from '@opensearch-project/opensearch';

export const restaurantSearchIndexBody = {
  settings: { number_of_shards: 1, number_of_replicas: 0 },
  mappings: {
    dynamic: 'strict',
    properties: {
      restaurantId: { type: 'keyword' },
      name: { type: 'text' },
      category: { type: 'keyword' },
      menuItemNames: { type: 'text' },
      location: { type: 'geo_point' },
      timeZone: { type: 'keyword' },
      openingPeriodCodes: { type: 'long', index: false },
    },
  },
} satisfies API.Indices_Create_RequestBody;
