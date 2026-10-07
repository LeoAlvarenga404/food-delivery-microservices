import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import {
  parseRestaurantId,
  type RestaurantId,
} from '#domain/restaurant/restaurant-id.value-object.ts';
import { unwrap } from './restaurant.builder.ts';

export class FakeIdGenerator implements IdGenerator {
  #restaurantCount = 0;

  generateRestaurantId(): RestaurantId {
    this.#restaurantCount += 1;
    const suffix = `b${this.#restaurantCount.toString(16)}`.padStart(12, '0');
    return unwrap(parseRestaurantId(`0199a5d0-0000-7000-8000-${suffix}`));
  }
}
