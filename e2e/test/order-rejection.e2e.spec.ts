import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { DockerComposeStack } from './support/docker-compose-stack.adapter.ts';
import {
  HttpConsumerApi,
  openPizzeria,
  type PizzeriaOrder,
} from './support/http-consumer-api.adapter.ts';

const consumerApi = new HttpConsumerApi('consumer-a');
const unregisteredConsumerApi = new HttpConsumerApi('consumer-b');
const stack = new DockerComposeStack();
let pizzeriaOrder: PizzeriaOrder;

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

describe('an order the saga cannot complete', () => {
  it('is rejected when the card is declined, after the kitchen rejected its ticket', async () => {
    const response = await consumerApi.placeOrder(
      { ...pizzeriaOrder, paymentToken: 'tok_visa_0002' },
      { 'idempotency-key': randomUUID() },
    );
    const orderId = await consumerApi.readPlacedOrderId(response);

    await expect(consumerApi.waitForOrderStatus(orderId, 'REJECTED')).resolves.toMatchObject({
      orderId,
      status: 'REJECTED',
      rejectionReason: 'PAYMENT_DECLINED',
    });
    expect(await stack.readTicketStatus(orderId)).toBe('REJECTED');
  });

  it('is rejected when the platform does not know the consumer', async () => {
    const response = await unregisteredConsumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
    });
    const orderId = await unregisteredConsumerApi.readPlacedOrderId(response);

    await expect(
      unregisteredConsumerApi.waitForOrderStatus(orderId, 'REJECTED'),
    ).resolves.toMatchObject({
      orderId,
      status: 'REJECTED',
      rejectionReason: 'CONSUMER_NOT_FOUND',
    });
    expect(await stack.readTicketStatus(orderId)).toBe('');
  });
});
