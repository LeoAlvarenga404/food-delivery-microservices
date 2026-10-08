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
const accountingService = 'accounting-service';
const recoveryLimitInMilliseconds = 120_000;
let pizzeriaOrder: PizzeriaOrder;

beforeAll(async () => {
  await consumerApi.waitUntilReachableAndRegistered();
  pizzeriaOrder = await openPizzeria();
});

afterEach(() => stack.startService(accountingService));

describe('an order whose payment is authorized after its deadline', () => {
  it('is rejected at the deadline, and its orphan authorization is voided once Accounting is back', async () => {
    await stack.stopService(accountingService);
    const response = await consumerApi.placeOrder(pizzeriaOrder, {
      'idempotency-key': randomUUID(),
    });
    const orderId = await consumerApi.readPlacedOrderId(response);

    await expect(
      consumerApi.waitForOrderStatus(orderId, 'REJECTED', recoveryLimitInMilliseconds),
    ).resolves.toMatchObject({ rejectionReason: 'PAYMENT_AUTHORIZATION_TIMED_OUT' });
    await stack.startService(accountingService);

    await expect
      .poll(() => stack.readPaymentStatus(orderId), {
        timeout: recoveryLimitInMilliseconds,
        interval: 1_000,
      })
      .toBe('VOIDED');
    const sagaId = await stack.readSagaId(orderId);
    await expect
      .poll(
        async () =>
          (await stack.readMessageTypesByKey('order.place-order-saga.replies')).get(sagaId),
        { timeout: 60_000 },
      )
      .toEqual([
        'fooddelivery.consumer.v1.ConsumerVerified',
        'fooddelivery.kitchen.v1.TicketCreated',
        'fooddelivery.kitchen.v1.TicketRejected',
        'fooddelivery.accounting.v1.PaymentAuthorized',
        'fooddelivery.accounting.v1.AuthorizationVoided',
      ]);
    expect((await stack.readMessageTypesByKey('accounting.commands')).get(orderId)).toEqual([
      'fooddelivery.accounting.v1.AuthorizePayment',
      'fooddelivery.accounting.v1.VoidAuthorization',
    ]);
    expect((await consumerApi.waitForOrderStatus(orderId, 'REJECTED')).status).toBe('REJECTED');
  });
});
