import type { API, Types } from '@opensearch-project/opensearch';

export const restaurantSearchSynonyms: string[] = [
  'hamburguer, hamburger, burger, lanche',
  'refri, refrigerante',
];

const textAnalysis: Types.Common_Mapping.TextProperty = {
  type: 'text',
  analyzer: 'restaurant_text',
  search_analyzer: 'restaurant_text_search',
  copy_to: 'suggestionText',
  fields: { asYouType: { type: 'search_as_you_type', analyzer: 'restaurant_prefix' } },
};

export const restaurantSearchIndexBody = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      filter: {
        portuguese_stop: { type: 'stop', stopwords: '_portuguese_' },
        portuguese_light_stemmer: { type: 'stemmer', language: 'light_portuguese' },
        restaurant_synonyms: { type: 'synonym_graph', synonyms: restaurantSearchSynonyms },
        suggestion_shingle: { type: 'shingle', min_shingle_size: 2, max_shingle_size: 3 },
      },
      analyzer: {
        restaurant_text: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'portuguese_stop', 'portuguese_light_stemmer'],
        },
        restaurant_text_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: [
            'lowercase',
            'asciifolding',
            'portuguese_stop',
            'restaurant_synonyms',
            'portuguese_light_stemmer',
          ],
        },
        restaurant_prefix: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
        restaurant_suggestion: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'suggestion_shingle'],
        },
      },
    },
  },
  mappings: {
    dynamic: 'strict',
    properties: {
      restaurantId: { type: 'keyword' },
      name: textAnalysis,
      category: { type: 'keyword' },
      menuItemNames: textAnalysis,
      location: { type: 'geo_point' },
      timeZone: { type: 'keyword' },
      openingPeriodCodes: { type: 'long', index: false },
      suggestionText: { type: 'text', analyzer: 'restaurant_suggestion' },
    },
  },
} satisfies API.Indices_Create_RequestBody;
