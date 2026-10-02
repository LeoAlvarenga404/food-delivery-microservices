import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { create, equals } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { OrderPlacedSchema } from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectGoldenSample, readGoldenSample, type GoldenSample } from './golden-samples.ts';

const orderPlaced = create(OrderPlacedSchema, {
  orderId: 'order-1',
  consumerId: 'consumer-1',
  restaurantId: 'restaurant-1',
  lineItems: [
    { menuItemId: 'margherita', name: 'Margherita', unitPriceInCents: 4500n, quantity: 2 },
  ],
  totalInCents: 9000n,
  currency: 'BRL',
  placedAt: timestampFromDate(new Date('2026-10-01T12:00:00.000Z')),
});

let temporaryDirectory: string;
let sample: GoldenSample<typeof OrderPlacedSchema>;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'golden-samples-'));
  sample = {
    directory: pathToFileURL(`${temporaryDirectory}/`),
    topic: 'order.order.events',
    schema: OrderPlacedSchema,
  };
});

afterEach(async () => {
  delete process.env['UPDATE_GOLDEN'];
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('expectGoldenSample', () => {
  it('writes the Protobuf JSON mapping to <topic>/<MessageType>.json when UPDATE_GOLDEN=1', async () => {
    process.env['UPDATE_GOLDEN'] = '1';

    await expectGoldenSample(sample, orderPlaced);
    const written = await readFile(
      join(temporaryDirectory, 'order.order.events', 'OrderPlaced.json'),
      'utf8',
    );

    expect(JSON.parse(written)).toEqual({
      orderId: 'order-1',
      consumerId: 'consumer-1',
      restaurantId: 'restaurant-1',
      lineItems: [
        { menuItemId: 'margherita', name: 'Margherita', unitPriceInCents: '4500', quantity: 2 },
      ],
      totalInCents: '9000',
      currency: 'BRL',
      placedAt: '2026-10-01T12:00:00Z',
    });
    expect(written.endsWith('\n')).toBe(true);
  });

  it('passes when the message matches the stored sample', async () => {
    process.env['UPDATE_GOLDEN'] = '1';
    await expectGoldenSample(sample, orderPlaced);
    delete process.env['UPDATE_GOLDEN'];

    await expect(expectGoldenSample(sample, orderPlaced)).resolves.toBeUndefined();
  });

  it('fails when the produced message drifts from the stored sample', async () => {
    process.env['UPDATE_GOLDEN'] = '1';
    await expectGoldenSample(sample, orderPlaced);
    delete process.env['UPDATE_GOLDEN'];
    const drifted = create(OrderPlacedSchema, { ...orderPlaced, totalInCents: 9001n });

    await expect(expectGoldenSample(sample, drifted)).rejects.toThrow('golden sample');
  });

  it('fails when the sample file does not exist yet', async () => {
    await expect(expectGoldenSample(sample, orderPlaced)).rejects.toThrow('ENOENT');
  });
});

describe('readGoldenSample', () => {
  it('decodes the stored sample into an equal message for consumer tests', async () => {
    process.env['UPDATE_GOLDEN'] = '1';
    await expectGoldenSample(sample, orderPlaced);

    const decoded = await readGoldenSample(sample);

    expect(equals(OrderPlacedSchema, decoded, orderPlaced)).toBe(true);
  });
});
