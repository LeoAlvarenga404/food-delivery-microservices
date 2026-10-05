import type {
  CategoryCount,
  RestaurantSearch,
  RestaurantSearchHit,
  RestaurantSearchIndex,
  RestaurantSearchResults,
  SearchableRestaurant,
} from '#application/ports/restaurant-search-index.port.ts';
import type { GeoPoint } from '#domain/restaurant/restaurant-address.value-object.ts';
import {
  minutesPerWeek,
  openingPeriodCodeBase,
  restaurantSearchDocumentPersistenceMapper,
  type RestaurantSearchDocument,
} from '#infrastructure/search/restaurant-search-document.persistence-mapper.ts';

interface StoredDocument {
  readonly document: RestaurantSearchDocument;
  readonly version: number;
}

const earthRadiusInKilometers = 6371;
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function wordsOf(text: string): readonly string[] {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return folded.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
}

function matchesText(document: RestaurantSearchDocument, text: string): boolean {
  const queryWords = wordsOf(text);
  if (queryWords.length === 0) return true;
  const documentWords = [document.name, ...document.menuItemNames].flatMap(wordsOf);
  return queryWords.some((queryWord) => documentWords.some((word) => word.startsWith(queryWord)));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceInKilometers(origin: GeoPoint, document: RestaurantSearchDocument): number {
  const latitudeDelta = toRadians(document.location.lat - origin.latitude);
  const longitudeDelta = toRadians(document.location.lon - origin.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(document.location.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusInKilometers * Math.asin(Math.sqrt(haversine));
}

function isWithinRadius(document: RestaurantSearchDocument, search: RestaurantSearch): boolean {
  const { origin, radiusInKilometers } = search;
  if (origin === undefined || radiusInKilometers === undefined) return true;
  return distanceInKilometers(origin, document) <= radiusInKilometers;
}

function minuteOfWeekAt(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const partOf = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const dayIndex = weekdays.indexOf(partOf('weekday'));
  return dayIndex * 1440 + Number(partOf('hour')) * 60 + Number(partOf('minute'));
}

function isOpenAt(document: RestaurantSearchDocument, instant: Date): boolean {
  const minuteOfWeek = minuteOfWeekAt(document.timeZone, instant);
  return document.openingPeriodCodes.some((code) => {
    const opensAt = Math.trunc(code / openingPeriodCodeBase);
    const durationInMinutes = code % openingPeriodCodeBase;
    return (minuteOfWeek - opensAt + minutesPerWeek) % minutesPerWeek < durationInMinutes;
  });
}

function countCategories(documents: readonly RestaurantSearchDocument[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const { category } of documents) counts.set(category, (counts.get(category) ?? 0) + 1);
  return [...counts]
    .map(([category, restaurantCount]) => ({ category, restaurantCount }))
    .toSorted(
      (first, second) =>
        second.restaurantCount - first.restaurantCount ||
        first.category.localeCompare(second.category),
    );
}

function toHit(document: RestaurantSearchDocument, searchedAt: Date): RestaurantSearchHit {
  const { restaurantId, name, category } = document;
  return {
    restaurantId,
    name,
    category,
    isOpenNow: isOpenAt(document, searchedAt),
    highlights: [],
  };
}

export class InMemoryRestaurantSearchIndex implements RestaurantSearchIndex {
  #documents = new Map<string, StoredDocument>();

  save(restaurant: SearchableRestaurant): Promise<boolean> {
    return Promise.resolve(this.#saveTo(this.#documents, restaurant));
  }

  search(search: RestaurantSearch): Promise<RestaurantSearchResults> {
    const matches = [...this.#documents.values()]
      .map((stored) => stored.document)
      .filter((document) => matchesText(document, search.text) && isWithinRadius(document, search))
      .toSorted((first, second) => first.restaurantId.localeCompare(second.restaurantId));
    const hits = matches
      .filter((document) => search.category === undefined || document.category === search.category)
      .slice(0, search.limit)
      .map((document) => toHit(document, search.searchedAt));
    return Promise.resolve({ hits, categories: countCategories(matches), suggestion: undefined });
  }

  async rebuild(loadRestaurants: () => Promise<readonly SearchableRestaurant[]>): Promise<void> {
    const rebuilt = new Map<string, StoredDocument>();
    for (const restaurant of await loadRestaurants()) this.#saveTo(rebuilt, restaurant);
    this.#documents = rebuilt;
    for (const restaurant of await loadRestaurants()) this.#saveTo(this.#documents, restaurant);
  }

  #saveTo(documents: Map<string, StoredDocument>, restaurant: SearchableRestaurant): boolean {
    const stored = documents.get(restaurant.restaurantId);
    if (stored !== undefined && stored.version >= restaurant.version) return false;
    const document = restaurantSearchDocumentPersistenceMapper.toDocument(restaurant);
    documents.set(restaurant.restaurantId, { document, version: restaurant.version });
    return true;
  }
}
