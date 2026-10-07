import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startKitchenTestDatabase,
  type KitchenTestDatabase,
} from '../../../test/support/kitchen-database.builder.ts';
import { describeRestaurantMembershipRepositoryContract } from '../../../test/support/restaurant-membership-repository.contract.ts';
import { PostgresRestaurantMembershipRepository } from './postgres-restaurant-membership.repository.ts';

let testDatabase: KitchenTestDatabase;

beforeAll(async () => {
  testDatabase = await startKitchenTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
});

afterAll(async () => {
  await testDatabase.stop();
});

describeRestaurantMembershipRepositoryContract(
  'postgres',
  () => new PostgresRestaurantMembershipRepository(testDatabase.database),
);

describe('postgres restaurant_memberships table', () => {
  it.each([
    { scenario: 'a version of zero', version: 0, staffMemberIds: '[]' },
    { scenario: 'members that are not a list', version: 1, staffMemberIds: '{}' },
  ])('rejects $scenario', async ({ version, staffMemberIds }) => {
    const insertion = sql`
      insert into restaurant_memberships (restaurant_id, version, staff_member_ids)
      values ('0199a5d0-0000-7000-8000-0000000003b1', ${version}, ${staffMemberIds}::jsonb)
    `.execute(testDatabase.database);

    await expect(insertion).rejects.toMatchObject({ code: '23514' });
  });
});
