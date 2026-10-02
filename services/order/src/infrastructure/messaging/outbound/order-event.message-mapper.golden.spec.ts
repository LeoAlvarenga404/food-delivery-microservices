import { expectGoldenSample } from '@fd/chassis-testing';
import { goldenSamplesDirectory } from '@fd/contracts';
import {
  OrderApprovedSchema,
  OrderPlacedSchema,
} from '@fd/contracts/fooddelivery/order/v1/events_pb.js';
import { describe, it } from 'vitest';
import { buildOrder, unwrap } from '../../../../test/support/order.builder.ts';
import { toOrderApprovedContract, toOrderPlacedContract } from './order-event.message-mapper.ts';

const topic = 'order.order.events';

describe('order event golden samples', () => {
  it('produces the OrderPlaced sample', async () => {
    const [placed] = buildOrder().pullRecordedEvents();
    if (placed?.eventType !== 'OrderPlaced') throw new Error('expected OrderPlaced');

    await expectGoldenSample(
      { directory: goldenSamplesDirectory, topic, schema: OrderPlacedSchema },
      toOrderPlacedContract(placed),
    );
  });

  it('produces the OrderApproved sample', async () => {
    const order = buildOrder();
    unwrap(order.approve(new Date('2026-10-02T12:00:05.000Z')));
    const approved = order.pullRecordedEvents().at(-1);
    if (approved?.eventType !== 'OrderApproved') throw new Error('expected OrderApproved');

    await expectGoldenSample(
      { directory: goldenSamplesDirectory, topic, schema: OrderApprovedSchema },
      toOrderApprovedContract(approved),
    );
  });
});
