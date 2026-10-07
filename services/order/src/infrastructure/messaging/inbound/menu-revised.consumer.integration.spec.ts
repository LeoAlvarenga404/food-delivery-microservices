import { Writable } from 'node:stream';
import {
  PermanentMessageFailure,
  type InboundMessage,
  type MessageHandler,
} from '@fd/chassis-kafka';
import { createLogger, type Logger } from '@fd/chassis-observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildMenuRevisedMessage,
  snapshotOf,
} from '../../../../test/support/menu-revised-message.builder.ts';
import {
  startOrderTestDatabase,
  type OrderTestDatabase,
} from '../../../../test/support/order-database.builder.ts';
import { margheritaId, pizzeriaMenu, unwrap } from '../../../../test/support/order.builder.ts';
import { parseRestaurantId } from '#domain/menu/restaurant-id.value-object.ts';
import type { RestaurantMenu } from '#domain/menu/restaurant-menu.value-object.ts';
import { PostgresRestaurantMenuRepository } from '#infrastructure/persistence/postgres-restaurant-menu.repository.ts';
import { menuRevisedConsumer } from './menu-revised.consumer.ts';

let testDatabase: OrderTestDatabase;
let menus: PostgresRestaurantMenuRepository;
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
  return createLogger({ serviceName: 'order-service', level: 'info' }, destination);
}

function pizzeriaMenuOf(
  restaurantId: string,
  version: number,
  margheritaPriceInCents: bigint,
): RestaurantMenu {
  return {
    ...pizzeriaMenu,
    restaurantId: unwrap(parseRestaurantId(restaurantId)),
    version,
    items: [
      {
        menuItemId: margheritaId,
        name: 'Margherita',
        priceInCents: margheritaPriceInCents,
        isAvailable: true,
      },
    ],
  };
}

function revisionOf(menu: RestaurantMenu): InboundMessage {
  return buildMenuRevisedMessage({ restaurant: snapshotOf(menu) });
}

beforeAll(async () => {
  testDatabase = await startOrderTestDatabase();
});

beforeEach(() => {
  logEntries = [];
  menus = new PostgresRestaurantMenuRepository(testDatabase.database);
  handleMenuRevision = menuRevisedConsumer({ menus, logger: captureLogger() });
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('menuRevisedConsumer', () => {
  it('stores the first snapshot of a restaurant and logs it as applied', async () => {
    const menu = pizzeriaMenuOf('0199a5d0-0000-7000-8000-0000000002a1', 1, 4500n);
    const revision = revisionOf(menu);

    await handleMenuRevision(revision);

    expect(await menus.findByRestaurantId(menu.restaurantId)).toEqual(menu);
    expect(logEntries).toContainEqual(
      expect.objectContaining({
        msg: 'menu revision applied',
        restaurantId: menu.restaurantId,
        version: 1,
        messageId: revision.headers.messageId,
        correlationId: revision.headers.correlationId,
      }),
    );
  });

  it('replaces the replica with a newer snapshot', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000002a2';
    const revised = pizzeriaMenuOf(restaurantId, 2, 5200n);
    await handleMenuRevision(revisionOf(pizzeriaMenuOf(restaurantId, 1, 4500n)));

    await handleMenuRevision(revisionOf(revised));

    expect(await menus.findByRestaurantId(revised.restaurantId)).toEqual(revised);
  });

  it('ignores a redelivered snapshot and logs it as ignored', async () => {
    const menu = pizzeriaMenuOf('0199a5d0-0000-7000-8000-0000000002a3', 1, 4500n);
    const revision = revisionOf(menu);
    await handleMenuRevision(revision);

    await handleMenuRevision(revision);

    expect(await menus.findByRestaurantId(menu.restaurantId)).toEqual(menu);
    expect(logEntries.map((entry) => entry['msg'])).toEqual([
      'menu revision applied',
      'menu revision ignored',
    ]);
  });

  it('ignores an older snapshot that arrives after a newer one', async () => {
    const restaurantId = '0199a5d0-0000-7000-8000-0000000002a4';
    const newer = pizzeriaMenuOf(restaurantId, 3, 5200n);
    await handleMenuRevision(revisionOf(newer));

    await handleMenuRevision(revisionOf(pizzeriaMenuOf(restaurantId, 2, 4500n)));

    expect(await menus.findByRestaurantId(newer.restaurantId)).toEqual(newer);
  });

  it('dead-letters a snapshot it cannot read and leaves the replica as it was', async () => {
    const menu = pizzeriaMenuOf('0199a5d0-0000-7000-8000-0000000002a5', 1, 4500n);
    await handleMenuRevision(revisionOf(menu));
    const unreadable = {
      ...revisionOf(pizzeriaMenuOf(menu.restaurantId, 2, 5200n)),
      payload: Uint8Array.of(0xff),
    };

    await expect(handleMenuRevision(unreadable)).rejects.toThrow(PermanentMessageFailure);
    expect(await menus.findByRestaurantId(menu.restaurantId)).toEqual(menu);
  });
});
