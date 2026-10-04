import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { KeycloakSignIn } from './keycloak-sign-in.adapter.ts';

const onboardedRestaurantSchema = z.object({ restaurantId: z.uuid() });
const membershipsSchema = z.object({
  memberships: z.array(
    z.object({ restaurantId: z.uuid(), restaurantName: z.string(), role: z.string() }),
  ),
});
const pollIntervalInMilliseconds = 500;

export const pizzeriaOnboarding = {
  name: 'Pizzaria Bella',
  category: 'Pizza',
  address: {
    street: 'Avenida Paulista',
    number: '1000',
    city: 'Sao Paulo',
    postalCode: '01310-100',
    location: { latitude: -23.5614, longitude: -46.6559 },
  },
  timeZone: 'America/Sao_Paulo',
  openingHours: [
    { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '23:30' },
    { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
  ],
  minimumOrderInCents: '2000',
};

export const pizzeriaMenu = [
  {
    menuItemId: '0199a5d0-0000-7000-8000-000000000d01',
    name: 'Margherita',
    priceInCents: '4500',
    isAvailable: true,
  },
  {
    menuItemId: '0199a5d0-0000-7000-8000-000000000d02',
    name: 'Guarana',
    priceInCents: '800',
    isAvailable: false,
  },
];

export class HttpRestaurantApi {
  readonly #signIn: KeycloakSignIn | undefined;
  readonly #baseUrl: string;

  constructor(
    username: string | undefined,
    baseUrl = process.env['E2E_EDGE_URL'] ?? 'http://127.0.0.1:8080',
  ) {
    this.#signIn = username === undefined ? undefined : new KeycloakSignIn(username);
    this.#baseUrl = baseUrl;
  }

  async onboardRestaurant(onboarding: object): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurant/restaurants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await this.#authorization()) },
      body: JSON.stringify(onboarding),
    });
  }

  async reviseMenu(restaurantId: string, menuItems: readonly object[]): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurant/restaurants/${restaurantId}/menu`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await this.#authorization()) },
      body: JSON.stringify({ menuItems }),
    });
  }

  async fetchRestaurant(restaurantId: string): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurant/restaurants/${restaurantId}`, {
      headers: await this.#authorization(),
    });
  }

  async fetchMemberships(): Promise<Response> {
    return fetch(`${this.#baseUrl}/v1/restaurant/memberships`, {
      headers: await this.#authorization(),
    });
  }

  async readMemberships(): Promise<z.infer<typeof membershipsSchema>['memberships']> {
    const response = await this.fetchMemberships();
    return membershipsSchema.parse(await response.json()).memberships;
  }

  async readRestaurantId(response: Response): Promise<string> {
    return onboardedRestaurantSchema.parse(await response.json()).restaurantId;
  }

  async onboardPizzeria(): Promise<string> {
    const response = await this.onboardRestaurant(pizzeriaOnboarding);
    if (response.status !== 201) {
      throw new Error(`onboarding the pizzeria failed: HTTP ${String(response.status)}`);
    }
    return this.readRestaurantId(response);
  }

  async waitUntilReachable(limitInMilliseconds = 120_000): Promise<void> {
    const deadlineInMilliseconds = Date.now() + limitInMilliseconds;
    while (Date.now() < deadlineInMilliseconds) {
      const response = await this.fetchMemberships().catch(() => undefined);
      if (response?.ok === true) return;
      await delay(pollIntervalInMilliseconds);
    }
    throw new Error(`the restaurant API at ${this.#baseUrl} is not reachable; run pnpm stack:up`);
  }

  async #authorization(): Promise<Record<string, string>> {
    if (this.#signIn === undefined) return {};
    return { authorization: `Bearer ${await this.#signIn.accessToken()}` };
  }
}
