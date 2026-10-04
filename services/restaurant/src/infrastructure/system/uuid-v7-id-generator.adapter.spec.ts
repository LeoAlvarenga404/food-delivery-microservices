import { describe, expect, it } from 'vitest';
import { UuidV7IdGenerator } from './uuid-v7-id-generator.adapter.ts';

describe('UuidV7IdGenerator', () => {
  it('generates restaurant ids as lowercase version 7 uuids in creation order', () => {
    const generator = new UuidV7IdGenerator();

    const restaurantIds = Array.from({ length: 1000 }, () => generator.generateRestaurantId());

    expect(restaurantIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(restaurantIds).toEqual(restaurantIds.toSorted());
  });
});
