import { v7 as generateUuidV7 } from 'uuid';
import type { IdGenerator } from '#application/ports/id-generator.port.ts';
import {
  parseRestaurantId,
  type RestaurantId,
} from '#domain/restaurant/restaurant-id.value-object.ts';

export class UuidV7IdGenerator implements IdGenerator {
  generateRestaurantId(): RestaurantId {
    const restaurantId = parseRestaurantId(generateUuidV7());
    if (restaurantId.isLeft()) {
      throw new Error(`uuid generator produced ${restaurantId.failure.rawRestaurantId}`);
    }
    return restaurantId.success;
  }
}
