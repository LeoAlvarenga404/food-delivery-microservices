import { z } from 'zod';
import type {
  RestaurantSearch,
  RestaurantSearchResults,
} from '#application/ports/restaurant-search-index.port.ts';
import {
  minutesPerWeek,
  openingPeriodCodeBase,
} from './restaurant-search-document.persistence-mapper.ts';

const isOpenNowSource = `
  ZonedDateTime local;
  try {
    local = Instant.ofEpochMilli(params.searchedAtInMilliseconds)
      .atZone(ZoneId.of(doc['timeZone'].value));
  } catch (DateTimeException unknownZone) {
    return 0;
  }
  long minuteOfWeek = (local.getDayOfWeek().getValue() - 1) * 1440L
    + local.getHour() * 60L + local.getMinute();
  for (long code : doc['openingPeriodCodes']) {
    long opensAt = code / ${String(openingPeriodCodeBase)}L;
    long durationInMinutes = code % ${String(openingPeriodCodeBase)}L;
    if ((minuteOfWeek - opensAt + ${String(minutesPerWeek)}L) % ${String(minutesPerWeek)}L < durationInMinutes) {
      return 1;
    }
  }
  return 0;
`;

const searchResponseSchema = z.object({
  hits: z.object({
    hits: z.array(
      z.object({
        _source: z.object({ restaurantId: z.string(), name: z.string(), category: z.string() }),
        fields: z.object({ isOpenNow: z.array(z.number()) }),
        highlight: z.record(z.string(), z.array(z.string())).optional(),
      }),
    ),
  }),
  aggregations: z.object({
    categories: z.object({
      buckets: z.array(z.object({ key: z.string(), doc_count: z.number() })),
    }),
  }),
  suggest: z
    .object({ correction: z.array(z.object({ options: z.array(z.object({ text: z.string() })) })) })
    .optional(),
});

function isOpenNowScript(searchedAt: Date): object {
  return {
    source: isOpenNowSource,
    params: { searchedAtInMilliseconds: searchedAt.getTime() },
  };
}

const prefixFields = [
  'name.asYouType',
  'name.asYouType._2gram',
  'name.asYouType._3gram',
  'menuItemNames.asYouType',
  'menuItemNames.asYouType._2gram',
  'menuItemNames.asYouType._3gram',
];

function textQuery(text: string): object {
  if (text.length === 0) return { match_all: {} };
  return {
    bool: {
      should: [
        {
          multi_match: {
            query: text,
            fields: ['name^2', 'menuItemNames'],
            fuzziness: 'AUTO',
            prefix_length: 1,
            fuzzy_transpositions: true,
          },
        },
        {
          multi_match: {
            query: text,
            type: 'bool_prefix',
            fields: prefixFields,
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

function radiusFilters(search: RestaurantSearch): object[] {
  const { origin, radiusInKilometers } = search;
  if (origin === undefined || radiusInKilometers === undefined) return [];
  const point = { lat: origin.latitude, lon: origin.longitude };
  return [{ geo_distance: { distance: `${String(radiusInKilometers)}km`, location: point } }];
}

function scoreFunctions(search: RestaurantSearch): object[] {
  const openNow = { script_score: { script: isOpenNowScript(search.searchedAt) }, weight: 2 };
  const { origin } = search;
  if (origin === undefined) return [openNow];
  const point = { lat: origin.latitude, lon: origin.longitude };
  return [{ gauss: { location: { origin: point, scale: '2km', decay: 0.5 } } }, openNow];
}

function scoredQuery(search: RestaurantSearch): object {
  return {
    function_score: {
      query: { bool: { must: [textQuery(search.text)], filter: radiusFilters(search) } },
      functions: scoreFunctions(search),
      score_mode: 'sum',
      boost_mode: 'sum',
    },
  };
}

function suggestion(text: string): object {
  if (text.length === 0) return {};
  return {
    suggest: {
      correction: {
        text,
        phrase: {
          field: 'suggestionText',
          size: 1,
          max_errors: 2,
          direct_generator: [{ field: 'suggestionText', suggest_mode: 'always' }],
        },
      },
    },
  };
}

export function toSearchRequestBody(search: RestaurantSearch): object {
  return {
    size: search.limit,
    query: scoredQuery(search),
    ...(search.category !== undefined && { post_filter: { term: { category: search.category } } }),
    aggs: { categories: { terms: { field: 'category', size: 20 } } },
    highlight: {
      fields: { name: {}, menuItemNames: {} },
      require_field_match: false,
      encoder: 'html',
    },
    script_fields: { isOpenNow: { script: isOpenNowScript(search.searchedAt) } },
    _source: ['restaurantId', 'name', 'category'],
    sort: ['_score', { restaurantId: 'asc' }],
    ...suggestion(search.text),
  };
}

export function toSearchResults(responseBody: unknown): RestaurantSearchResults {
  const response = searchResponseSchema.parse(responseBody);
  return {
    hits: response.hits.hits.map((hit) => ({
      ...hit._source,
      isOpenNow: hit.fields.isOpenNow[0] === 1,
      highlights: Object.values(hit.highlight ?? {}).flat(),
    })),
    categories: response.aggregations.categories.buckets.map((bucket) => ({
      category: bucket.key,
      restaurantCount: bucket.doc_count,
    })),
    suggestion: response.suggest?.correction[0]?.options[0]?.text,
  };
}
