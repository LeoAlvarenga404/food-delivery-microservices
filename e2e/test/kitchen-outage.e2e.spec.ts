import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const stack = new DockerComposeStack();
const kitchenService = 'kitchen-service';
const kitchenCommandTopic = 'kitchen.commands';
const recoveryLimitInMilliseconds = 120_000;
const burstSize = 6;
const settledOutcomes = [
  'APPROVED AWAITING_ACCEPTANCE',
  'REJECTED TICKET_CREATION_TIMED_OUT REJECTED',
  'REJECTED TICKET_CREATION_TIMED_OUT',
];
const orderSchema = z.object({ status: z.string(), rejectionReason: z.string().optional() });
let pizzeriaOrder: PizzeriaOrder;

async function placeOrder(paymentToken: string): Promise<string> {
  const response = await consumerApi.placeOrder(
    { ...pizzeriaOrder, paymentToken },
    { 'idempotency-key': randomUUID() },
  );
  return consumerApi.readPlacedOrderId(response);
}

async function readOrder(orderId: string): Promise<z.infer<typeof orderSchema>> {
  const response = await consumerApi.fetchOrder(orderId);
  return orderSchema.parse(await response.json());
}

async function readOutcome(orderId: string): Promise<string> {
  const { status, rejectionReason } = await readOrder(orderId);
  const ticketStatus = await stack.readTicketStatus(orderId);
  return [status, rejectionReason, ticketStatus]
    .filter((part) => part !== undefined && part !== '')
    .join(' ');
}

async function countKitchenCommands(orderId: string, commandType: string): Promise<number> {
  const messageTypesByKey = await stack.readMessageTypesByKey(kitchenCommandTopic);
  return (messageTypesByKey.get(orderId) ?? []).filter(
    (messageType) => messageType === `fooddelivery.kitchen.v1.${commandType}`,
  ).length;
}

async function waitForStepTimeouts(
  orderIds: readonly string[],
  since: Date,
  count: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const lines = await stack.readLogLinesSince(['order-service'], since);
        return lines.filter(
          (line) =>
            line.includes('place order saga step timed out') &&
            orderIds.some((orderId) => line.includes(orderId)),
        ).length;
      },
      { timeout: recoveryLimitInMilliseconds, interval: 1_000 },
    )
    .toBeGreaterThanOrEqual(count);
}

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
    'waits for the $outage kitchen past the ticket deadline, re-sending the rejection, and is rejected once it is back',
    async ({ interrupt }) => {
      await interrupt();
      const placedAt = new Date();
      const orderId = await placeOrder(pizzeriaOrder.paymentToken);

      await stack.waitForSagaStep(orderId, 'REJECTING_TICKET');
      await waitForStepTimeouts([orderId], placedAt, 3);
      await expect(
        consumerApi.waitForOrderStatus(orderId, 'APPROVAL_PENDING'),
      ).resolves.toMatchObject({ status: 'APPROVAL_PENDING' });
      await stack.startService(kitchenService);

      await expect(
        consumerApi.waitForOrderStatus(orderId, 'REJECTED', recoveryLimitInMilliseconds),
      ).resolves.toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'TICKET_CREATION_TIMED_OUT',
      });
      expect(await stack.readTicketStatus(orderId)).toBe('REJECTED');
      expect(await countKitchenCommands(orderId, 'RejectTicket')).toBeGreaterThanOrEqual(3);
    },
  );

  it('settles every order of a burst whose kitchen is killed mid-command, each with a matching ticket', async () => {
    const placedAt = new Date();
    const orderIds = await Promise.all(
      Array.from({ length: burstSize }, () => placeOrder(pizzeriaOrder.paymentToken)),
    );
    await stack.killService(kitchenService);
    const statusesAtKill = await Promise.all(
      orderIds.map(async (orderId) => (await readOrder(orderId)).status),
    );
    expect(statusesAtKill).toContain('APPROVAL_PENDING');
    await waitForStepTimeouts(orderIds, placedAt, 1);
    await stack.startService(kitchenService);

    for (const orderId of orderIds) {
      await expect
        .poll(async () => (await readOrder(orderId)).status, {
          timeout: recoveryLimitInMilliseconds,
          interval: 500,
        })
        .toMatch(/^(?:APPROVED|REJECTED)$/);
    }
    const outcomes = await Promise.all(orderIds.map(readOutcome));
    expect(outcomes.filter((outcome) => !settledOutcomes.includes(outcome))).toEqual([]);
  });

  it('re-sends the approval to a kitchen killed after the payment and approves once it is back', async () => {
    const placedAt = new Date();
    const orderId = await placeOrder('tok_visa_0009');
    await stack.waitForSagaStep(orderId, 'AUTHORIZING_PAYMENT');
    await stack.killService(kitchenService);

    await stack.waitForSagaStep(orderId, 'APPROVING_TICKET');
    await waitForStepTimeouts([orderId], placedAt, 2);
    await expect(
      consumerApi.waitForOrderStatus(orderId, 'APPROVAL_PENDING'),
    ).resolves.toMatchObject({ status: 'APPROVAL_PENDING' });
    await stack.startService(kitchenService);

    await expect(
      consumerApi.waitForOrderStatus(orderId, 'APPROVED', recoveryLimitInMilliseconds),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(await stack.readTicketStatus(orderId)).toBe('AWAITING_ACCEPTANCE');
    expect(await countKitchenCommands(orderId, 'ApproveTicket')).toBeGreaterThanOrEqual(3);
  });
});
