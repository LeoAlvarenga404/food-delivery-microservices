import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const stack = new DockerComposeStack();
const kitchenService = 'kitchen-service';
let pizzeriaOrder: PizzeriaOrder;

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

afterEach(() => stack.startService(kitchenService));

describe('an order whose kitchen goes down in the middle of the saga', () => {
  it.each([
    { outage: 'stopped', interrupt: () => stack.stopService(kitchenService) },
    { outage: 'killed', interrupt: () => stack.killService(kitchenService) },
  ])(
    'waits for the $outage kitchen past the ticket deadline and is rejected once it is back',
    async ({ interrupt }) => {
      await interrupt();
      const response = await consumerApi.placeOrder(pizzeriaOrder, {
        'idempotency-key': randomUUID(),
      });
      const orderId = await consumerApi.readPlacedOrderId(response);

      await stack.waitForSagaStep(orderId, 'REJECTING_TICKET');
      await expect(
        consumerApi.waitForOrderStatus(orderId, 'APPROVAL_PENDING'),
      ).resolves.toMatchObject({ status: 'APPROVAL_PENDING' });
      await stack.startService(kitchenService);

      await expect(
        consumerApi.waitForOrderStatus(orderId, 'REJECTED', 120_000),
      ).resolves.toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'TICKET_CREATION_TIMED_OUT',
      });
      expect(await stack.readTicketStatus(orderId)).toBe('REJECTED');
    },
  );
});
