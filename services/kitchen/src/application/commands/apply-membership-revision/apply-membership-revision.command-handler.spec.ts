import { left, right } from '@fd/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRestaurantMembershipRepository } from '../../../../test/support/in-memory-restaurant-membership.repository.ts';
import {
  membershipOf,
  pizzeriaMembership,
  staffAId,
  staffBId,
} from '../../../../test/support/restaurant-membership.builder.ts';
import { ApplyMembershipRevisionCommandHandler } from './apply-membership-revision.command-handler.ts';

const revisedMembership = { ...pizzeriaMembership, version: 3, staffMemberIds: [staffBId] };

let memberships: InMemoryRestaurantMembershipRepository;
let applyMembershipRevision: ApplyMembershipRevisionCommandHandler;

beforeEach(() => {
  memberships = new InMemoryRestaurantMembershipRepository([pizzeriaMembership]);
  applyMembershipRevision = new ApplyMembershipRevisionCommandHandler(memberships);
});

describe('ApplyMembershipRevisionCommandHandler', () => {
  it('replaces the members of a restaurant with a newer snapshot', async () => {
    const outcome = await applyMembershipRevision.execute({ membership: revisedMembership });

    expect(outcome).toEqual(right(undefined));
    expect(await memberships.findByRestaurantId(pizzeriaMembership.restaurantId)).toEqual(
      revisedMembership,
    );
  });

  it('keeps the members of a restaurant from its first snapshot', async () => {
    const trattoria = membershipOf('0199a5d0-0000-7000-8000-0000000001a1', 1, [staffAId]);

    expect(await applyMembershipRevision.execute({ membership: trattoria })).toEqual(
      right(undefined),
    );
    expect(await memberships.findByRestaurantId(trattoria.restaurantId)).toEqual(trattoria);
  });

  it.each([
    { snapshot: 'the version the replica already has', version: 2 },
    { snapshot: 'an older version', version: 1 },
  ])('ignores a snapshot with $snapshot and keeps the members', async ({ version }) => {
    const outcome = await applyMembershipRevision.execute({
      membership: { ...revisedMembership, version },
    });

    expect(outcome).toEqual(
      left({
        type: 'StaleMembershipRevision',
        restaurantId: pizzeriaMembership.restaurantId,
        version,
      }),
    );
    expect(await memberships.findByRestaurantId(pizzeriaMembership.restaurantId)).toEqual(
      pizzeriaMembership,
    );
  });
});
