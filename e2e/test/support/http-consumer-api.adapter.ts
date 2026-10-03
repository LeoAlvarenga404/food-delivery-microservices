import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

const placedOrderSchema = z.object({ orderId: z.uuid() });

const orderViewSchema = z.object({
  orderId: z.uuid(),
  status: z.string(),
  totalInCents: z.string(),
  currency: z.string(),
});

export type OrderView = z.infer<typeof orderViewSchema>;

export const walkingSkeletonConsumerId = '0199a5d0-0000-7000-8000-0000000000c1';

export const pizzeriaOrder = {
  restaurantId: '0199a5d0-0000-7000-8000-000000000001',
  lineItems: [
    { menuItemId: '0199a5d0-0000-7000-8000-000000000101', quantity: 2 },
    { menuItemId: '0199a5d0-0000-7000-8000-000000000103', quantity: 1 },
  ],
  deliveryAddress: {
    street: 'Rua Augusta',
    number: '1500',
    city: 'Sao Paulo',
    postalCode: '01304-001',
  },
  paymentToken: 'tok_visa_4242',
};

const pollIntervalInMilliseconds = 500;

export class HttpConsumerApi {
  readonly #baseUrl: string;

  constructor(baseUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080') {
    this.#baseUrl = baseUrl;
  }

  placeOrder(order: object, headers: Readonly<Record<string, string>>): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(order),
    });
  }

  async readPlacedOrderId(response: Response): Promise<string> {
    return placedOrderSchema.parse(await response.json()).orderId;
  }

  async waitForOrderStatus(
    orderId: string,
    status: string,
    limitInMilliseconds = 60_000,
  ): Promise<OrderView> {
    const deadline = Date.now() + limitInMilliseconds;
    while (Date.now() < deadline) {
      const response = await fetch(`${this.#baseUrl}/v1/orders/${orderId}`);
      const order = response.ok ? orderViewSchema.parse(await response.json()) : undefined;
      if (order?.status === status) return order;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`order ${orderId} did not reach ${status} in time`);
  }

  async waitUntilReachable(limitInMilliseconds = 120_000): Promise<void> {
    const deadline = Date.now() + limitInMilliseconds;
    while (Date.now() < deadline) {
      const response = await fetch(`${this.#baseUrl}/health`).catch(() => undefined);
      if (response?.ok === true) return;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`the edge at ${this.#baseUrl} is not reachable; run pnpm stack:up first`);
  }
}
