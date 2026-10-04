import { fromBinary } from '@bufbuild/protobuf';
import { MenuRevisedSchema } from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import { left } from '@fd/domain';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/support/clock.fake.ts';
import { FakeIdGenerator } from '../../../test/support/id-generator.fake.ts';
import {
  startRestaurantTestDatabase,
  type RestaurantTestDatabase,
} from '../../../test/support/restaurant-database.builder.ts';
import {
  guarana,
  pizzeriaId,
  pizzeriaProfile,
  staffAId,
  staffBId,
} from '../../../test/support/restaurant.builder.ts';
import { OnboardRestaurantCommandHandler } from '#application/commands/onboard-restaurant/onboard-restaurant.command-handler.ts';
import { ReviseMenuCommandHandler } from '#application/commands/revise-menu/revise-menu.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import {
  createRestaurantUnitOfWork,
  type RestaurantUnitOfWork,
} from './restaurant-unit-of-work.adapter.ts';

interface OutboxRow {
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly messageType: string;
  readonly payload: Uint8Array;
  readonly correlationId: string;
  readonly actorId: string | null;
  readonly actorType: string | null;
}

const metadata: MessageMetadata = {
  correlationId: '0199a5d0-0000-7000-8000-0000000000f1',
  causationId: undefined,
  actorId: staffAId,
  actorType: 'restaurant_staff',
};

let testDatabase: RestaurantTestDatabase;
let unitOfWork: RestaurantUnitOfWork;
let messageCount = 0;

async function readOutbox(): Promise<readonly OutboxRow[]> {
  const result = await sql<OutboxRow>`
    select topic, aggregate_type, aggregate_id, message_type, payload, correlation_id,
      actor_id, actor_type
    from outbox order by id
  `.execute(testDatabase.database);
  return result.rows;
}

function versionsIn(outbox: readonly OutboxRow[]): readonly (number | undefined)[] {
  return outbox.map((row) => fromBinary(MenuRevisedSchema, row.payload).restaurant?.version);
}

async function onboardPizzeria(): Promise<void> {
  await new OnboardRestaurantCommandHandler({
    unitOfWork,
    clock: new FakeClock(),
    idGenerator: new FakeIdGenerator(),
  }).execute({ principal: { staffMemberId: staffAId }, profile: pizzeriaProfile, metadata });
}

function reviseMenu(): ReviseMenuCommandHandler {
  return new ReviseMenuCommandHandler({ unitOfWork, clock: new FakeClock() });
}

beforeAll(async () => {
  testDatabase = await startRestaurantTestDatabase();
});

beforeEach(async () => {
  await testDatabase.replaceRestaurants([]);
  await testDatabase.clearWrittenRows();
  unitOfWork = createRestaurantUnitOfWork({
    database: testDatabase.database,
    generateMessageId: () => {
      messageCount += 1;
      return `0199a5d0-0000-7000-8000-${messageCount.toString(16).padStart(12, '0')}`;
    },
    now: () => new Date('2026-10-04T12:00:01.000Z'),
  });
});

afterAll(async () => {
  await testDatabase.stop();
});

describe('restaurant unit of work', () => {
  it('writes the first MenuRevised to the state topic with the onboarded restaurant', async () => {
    await onboardPizzeria();

    const outbox = await readOutbox();

    expect(outbox).toMatchObject([
      {
        topic: 'restaurant.restaurant.state',
        aggregateType: 'Restaurant',
        aggregateId: pizzeriaId,
        messageType: 'fooddelivery.restaurant.v1.MenuRevised',
        correlationId: metadata.correlationId,
        actorId: staffAId,
        actorType: 'restaurant_staff',
      },
    ]);
    expect(versionsIn(outbox)).toEqual([1]);
  });

  it('writes a MenuRevised with the stored version for each revision', async () => {
    await onboardPizzeria();

    await reviseMenu().execute({
      principal: { staffMemberId: staffAId },
      restaurantId: pizzeriaId,
      menuItems: [guarana],
      metadata,
    });

    const outbox = await readOutbox();
    expect(versionsIn(outbox)).toEqual([1, 2]);
    expect(
      fromBinary(MenuRevisedSchema, outbox[1]?.payload ?? new Uint8Array()).restaurant,
    ).toMatchObject({ menuItems: [guarana] });
  });

  it('writes nothing when a staff member who is not a member revises the menu', async () => {
    await onboardPizzeria();

    const revision = await reviseMenu().execute({
      principal: { staffMemberId: staffBId },
      restaurantId: pizzeriaId,
      menuItems: [guarana],
      metadata,
    });

    expect(revision).toEqual(
      left({ type: 'NotRestaurantMember', restaurantId: pizzeriaId, staffMemberId: staffBId }),
    );
    expect(versionsIn(await readOutbox())).toEqual([1]);
  });
});
