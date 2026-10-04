import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { KeycloakSignIn } from './keycloak-sign-in.adapter.ts';

const placedOrderSchema = z.object({ orderId: z.uuid() });

const orderViewSchema = z.object({
  orderId: z.uuid(),
  status: z.string(),
  rejectionReason: z.string().optional(),
  totalInCents: z.string(),
  currency: z.string(),
});

export type OrderView = z.infer<typeof orderViewSchema>;

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

export const consumerRegistration = {
  name: 'Ana Souza',
  email: 'ana.souza@food-delivery.test',
  addresses: [pizzeriaOrder.deliveryAddress],
};

const pollIntervalInMilliseconds = 500;
const terminalOrderStatuses: readonly string[] = ['APPROVED', 'REJECTED'];

function failOnUnexpectedTerminalStatus(
  orderId: string,
  observedOrder: OrderView | undefined,
  awaitedStatus: string,
): void {
  if (observedOrder !== undefined && terminalOrderStatuses.includes(observedOrder.status)) {
    throw new Error(
      `order ${orderId} reached ${observedOrder.status} while waiting for ${awaitedStatus}`,
    );
  }
}

export class HttpConsumerApi {
  readonly #signIn: KeycloakSignIn | undefined;
  readonly #baseUrl: string;

  constructor(
    username: string | undefined,
    baseUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080',
  ) {
    this.#signIn = username === undefined ? undefined : new KeycloakSignIn(username);
    this.#baseUrl = baseUrl;
  }

  async placeOrder(order: object, headers: Readonly<Record<string, string>>): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await this.#authorization()), ...headers },
      body: JSON.stringify(order),
    });
  }

  async fetchOrder(orderId: string): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/orders/${orderId}`, { headers: await this.#authorization() });
  }

  async registerConsumer(registration: object): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/consumers/me`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await this.#authorization()) },
      body: JSON.stringify(registration),
    });
  }

  async fetchOwnConsumer(): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/consumers/me`, { headers: await this.#authorization() });
  }

  async readPlacedOrderId(response: Response): Promise<string> {
    return placedOrderSchema.parse(await response.json()).orderId;
  }

  async waitForOrderStatus(
    orderId: string,
    status: string,
    limitInMilliseconds = 60_000,
  ): Promise<OrderView> {
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    let lastObservation = 'no response';
    while (Date.now() < deadlineInMilliseconds) {
      const response = await this.fetchOrder(orderId);
      const order = response.ok ? orderViewSchema.parse(await response.json()) : undefined;
      if (order?.status === status) return order;
      failOnUnexpectedTerminalStatus(orderId, order, status);
      lastObservation = order?.status ?? `HTTP ${String(response.status)}`;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(
      `order ${orderId} did not reach ${status} in time; last seen ${lastObservation}`,
    );
  }

  async waitUntilReachable(limitInMilliseconds = 120_000): Promise<void> {
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    while (Date.now() < deadlineInMilliseconds) {
      const response = await fetch(`${this.#baseUrl}/health`).catch(() => undefined);
      if (response?.ok === true) return;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`the edge at ${this.#baseUrl} is not reachable; run pnpm stack:up first`);
  }

  async waitUntilReachableAndRegistered(): Promise<void> {
    await this.waitUntilReachable();
    const response = await this.registerConsumer(consumerRegistration);
    if (response.status !== 201 && response.status !== 409) {
      throw new Error(`registering the consumer failed: HTTP ${String(response.status)}`);
    }
  }

  async #authorization(): Promise<Record<string, string>> {
    if (this.#signIn === undefined) return {};
    return { authorization: `Bearer ${await this.#signIn.accessToken()}` };
  }
}
