import { beforeEach, describe, expect, it } from 'vitest';
import type { RestaurantMembershipRepository } from '#domain/membership/restaurant-membership.repository.ts';
import { membershipOf, staffAId, staffBId } from './restaurant-membership.builder.ts';

export function describeRestaurantMembershipRepositoryContract(
  implementationName: string,
  createRepository: () => RestaurantMembershipRepository,
): void {
  describe(`${implementationName} restaurant membership repository`, () => {
    let memberships: RestaurantMembershipRepository;

    beforeEach(() => {
      memberships = createRepository();
    });

    it('saves the first snapshot of a restaurant and finds its members', async () => {
      const membership = membershipOf('0199a5d0-0000-7000-8000-0000000003a1', 1, [
        staffAId,
        staffBId,
      ]);

      expect(await memberships.saveIfNewer(membership)).toBe(true);
      expect(await memberships.findByRestaurantId(membership.restaurantId)).toEqual(membership);
    });

    it('replaces the members with a newer snapshot', async () => {
      const restaurantId = '0199a5d0-0000-7000-8000-0000000003a2';
      await memberships.saveIfNewer(membershipOf(restaurantId, 1, [staffAId]));
      const revised = membershipOf(restaurantId, 2, [staffBId]);

      expect(await memberships.saveIfNewer(revised)).toBe(true);
      expect(await memberships.findByRestaurantId(revised.restaurantId)).toEqual(revised);
    });

    it.each([
      { snapshot: 'an equal version', version: 4 },
      { snapshot: 'an older version', version: 3 },
    ])('keeps the stored members when $snapshot arrives', async ({ version }) => {
      const stored = membershipOf('0199a5d0-0000-7000-8000-0000000003a3', 4, [staffAId]);
      await memberships.saveIfNewer(stored);

      const wasSaved = await memberships.saveIfNewer({
        ...stored,
        version,
        staffMemberIds: [staffBId],
      });

      expect(wasSaved).toBe(false);
      expect(await memberships.findByRestaurantId(stored.restaurantId)).toEqual(stored);
    });

    it('keeps a restaurant whose snapshot has no members', async () => {
      const membership = membershipOf('0199a5d0-0000-7000-8000-0000000003a4', 1, []);

      await memberships.saveIfNewer(membership);

      expect(await memberships.findByRestaurantId(membership.restaurantId)).toEqual(membership);
    });

    it('finds nothing for a restaurant without a snapshot', async () => {
      await memberships.saveIfNewer(
        membershipOf('0199a5d0-0000-7000-8000-0000000003a5', 1, [staffAId]),
      );
      const unknown = membershipOf('0199a5d0-0000-7000-8000-0000000003af', 1, []);

      expect(await memberships.findByRestaurantId(unknown.restaurantId)).toBeUndefined();
    });
  });
}
