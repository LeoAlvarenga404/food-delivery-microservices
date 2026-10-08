import { Writable } from 'node:stream';
import { PermanentMessageFailure, type MessageHandler } from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startKitchenTestDatabase,
  type KitchenTestDatabase,
} from '../../../../test/support/kitchen-database.builder.ts';
import {
  buildMenuRevisedMessage,
  menuRevisedOf,
} from '../../../../test/support/menu-revised-message.builder.ts';
import {
  membershipOf,
  staffAId,
  staffBId,
} from '../../../../test/support/restaurant-membership.builder.ts';
import { PostgresRestaurantMembershipRepository } from '#infrastructure/persistence/postgres-restaurant-membership.repository.ts';
import { menuRevisedConsumer } from './menu-revised.consumer.ts';

let testDatabase: KitchenTestDatabase;
let memberships: PostgresRestaurantMembershipRepository;
let handleMenuRevision: MessageHandler;
let logEntries: Record<string, unknown>[];

function captureLogger(): Logger {
  const destination = new Writable({
    write(chunk: Buffer, encoding, callback) {
      const parsed: unknown = JSON.parse(chunk.toString());
      logEntries.push(typeof parsed === 'object' && parsed !== null ? { ...parsed } : {});
      callback();
    },
  });
  return createLogger({ serviceName: 'kitchen-service', level: 'info' }, destination);
}

beforeAll(async () => {
  testDatabase = await startKitchenTestDatabase();
});

beforeEach(async () => {
  await testDatabase.clearWrittenRows();
  logEntries = [];
  memberships = new PostgresRestaurantMembershipRepository(testDatabase.database);
  handleMenuRevision = menuRevisedConsumer({ memberships, logger: captureLogger() });
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('menuRevisedConsumer', () => {
  it('keeps the members of a restaurant from its first snapshot and logs it as applied', async () => {
    const membership = membershipOf('0199a5d0-0000-7000-8000-0000000004a1', 1, [staffAId]);
    const revision = buildMenuRevisedMessage(menuRevisedOf(membership));

    await handleMenuRevision(revision);

    expect(await memberships.findByRestaurantId(membership.restaurantId)).toEqual(membership);
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        msg: 'restaurant membership applied',
        restaurantId: membership.restaurantId,
        version: 1,
        messageId: revision.headers.messageId,
        correlationId: revision.headers.correlationId,
      }),
    );
  });

  it('replaces the members with a newer snapshot', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000004a2';
    const revised = membershipOf(restaurantId, 2, [staffAId, staffBId]);
    await handleMenuRevision(
      buildMenuRevisedMessage(menuRevisedOf(membershipOf(restaurantId, 1, [staffAId]))),
    );

    await handleMenuRevision(buildMenuRevisedMessage(menuRevisedOf(revised)));

    expect(await memberships.findByRestaurantId(revised.restaurantId)).toEqual(revised);
  });

  it('ignores a redelivered snapshot and logs it as ignored', async () => {
    const membership = membershipOf('0199a5d0-0000-7000-8000-0000000004a3', 1, [staffAId]);
    const revision = buildMenuRevisedMessage(menuRevisedOf(membership));
    await handleMenuRevision(revision);

    await handleMenuRevision(revision);

    expect(await memberships.findByRestaurantId(membership.restaurantId)).toEqual(membership);
    expect(logEntries.map((entry) => entry['msg'])).toEqual([
      'restaurant membership applied',
      'restaurant membership ignored',
    ]);
  });

  it('ignores an older snapshot that arrives after a newer one', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000004a4';
    const newer = membershipOf(restaurantId, 3, [staffBId]);
    await handleMenuRevision(buildMenuRevisedMessage(menuRevisedOf(newer)));

    await handleMenuRevision(
      buildMenuRevisedMessage(menuRevisedOf(membershipOf(restaurantId, 2, [staffAId]))),
    );

    expect(await memberships.findByRestaurantId(newer.restaurantId)).toEqual(newer);
  });

  it('refuses a snapshot it cannot read as permanent and keeps the members', async () => {
    const membership = membershipOf('0199a5d0-0000-7000-8000-0000000004a5', 1, [staffAId]);
    await handleMenuRevision(buildMenuRevisedMessage(menuRevisedOf(membership)));
    const unreadable = {
      ...buildMenuRevisedMessage(menuRevisedOf({ ...membership, version: 2, staffMemberIds: [] })),
      payload: Uint8Array.of(0xff),
    };

    await expect(handleMenuRevision(unreadable)).rejects.toThrow(PermanentMessageFailure);
    expect(await memberships.findByRestaurantId(membership.restaurantId)).toEqual(membership);
  });
});
