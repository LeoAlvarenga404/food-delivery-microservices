import { randomBytes } from 'node:crypto';
import { expect, test, type Page, type Response } from '@playwright/test';
import { z } from 'zod';
import { HttpCatalogueApi } from '../test/support/http-catalogue-api.adapter.ts';
import { guaranaId, HttpConsumerApi } from '../test/support/http-consumer-api.adapter.ts';
import {
  aroundTheClockHours,
  HttpRestaurantApi,
  orderablePizzeriaMenu,
} from '../test/support/http-restaurant-api.adapter.ts';
import { KeycloakUserAdministration } from '../test/support/keycloak-user-administration.adapter.ts';

const siteUrl = process.env['E2E_SITE_URL'] ?? 'http://localhost:8080';
const jsonWebTokenPattern = /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/;
const statusTimeoutInMilliseconds = 60_000;
const millisecondsPerSecond = 1000;
const accessTokenLifetimeInSeconds = 300;
const keycloakSessionIdleTimeInSeconds = 1800;
const cartStorageKey = 'consumer-web-cart';
const letters = 'abcdefghijklmnopqrstuvwxyz';
const dishWord = `${randomLetters(1)}ab${randomLetters(7)}`;
const misspelledDishWord = `${dishWord.charAt(0)}ba${dishWord.slice(3)}`;
const dishName = `Torta <u>${dishWord}</u>`;
const deliveryAddressFields: readonly (readonly [string, string])[] = [
  ['Street', 'Rua Augusta'],
  ['Number', '1500'],
  ['City', 'Sao Paulo'],
  ['Postal code', '01304-001'],
];
const administration = new KeycloakUserAdministration();
let restaurantId: string;

function randomLetters(count: number): string {
  return Array.from(randomBytes(count), (byte) => letters.charAt(byte % letters.length)).join('');
}

async function openSearchablePizzeria(): Promise<string> {
  const menu = orderablePizzeriaMenu.map((menuItem) =>
    menuItem.name === 'Margherita' ? { ...menuItem, name: dishName } : menuItem,
  );
  const openedId = await new HttpRestaurantApi('staff-a').openPizzeria(aroundTheClockHours, menu);
  await new HttpCatalogueApi().waitForHit(misspelledDishWord, openedId);
  await new HttpConsumerApi('consumer-a').waitForPlacementRefusal(
    {
      restaurantId: openedId,
      lineItems: [{ menuItemId: guaranaId, quantity: 1 }],
      deliveryAddress: {
        street: 'Rua Augusta',
        number: '1500',
        city: 'Sao Paulo',
        postalCode: '01304-001',
      },
      paymentToken: 'tok_visa_4242',
    },
    'MinimumOrderNotReached',
  );
  return openedId;
}

function watchForTokens(page: Page): { readonly sightings: () => Promise<readonly string[]> } {
  const found: string[] = [];
  const inspections: Promise<void>[] = [];
  const inspect = async (response: Response): Promise<void> => {
    const body = await response.text().catch(() => '');
    if (jsonWebTokenPattern.test(body)) found.push(`a token in the body of ${response.url()}`);
  };
  page.on('request', (request) => {
    if (request.headers()['authorization'] !== undefined) {
      found.push(`an authorization header on ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(siteUrl)) inspections.push(inspect(response));
  });
  return {
    sightings: async () => {
      await Promise.all(inspections);
      return found;
    },
  };
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(`${username}-password`);
  await page.locator('#kc-login').click();
}

async function fillFields(
  page: Page,
  fields: readonly (readonly [string, string])[],
): Promise<void> {
  for (const [label, text] of fields) {
    await page.getByLabel(label, { exact: true }).fill(text);
  }
}

async function placeCart(page: Page, paymentToken: string): Promise<void> {
  await fillFields(page, [...deliveryAddressFields, ['Card token', paymentToken]]);
  await page.getByRole('button', { name: 'Place the order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
}

async function keepRefusedCart(page: Page): Promise<void> {
  await page.goto(`/restaurants/${restaurantId}`);
  await page.getByRole('button', { name: 'Add Guarana to the cart' }).click();
  await page.getByRole('link', { name: 'Cart' }).click();
  await fillFields(page, [...deliveryAddressFields, ['Card token', 'tok_visa_0001']]);
  await page.getByRole('button', { name: 'Place the order' }).click();
  const cart = page.getByRole('region', { name: 'Cart' });
  await expect(cart.getByRole('alert')).toHaveText(
    'The order is below the minimum of the restaurant.',
  );
  await expect(cart).toContainText('1 x Guarana');
  await page.getByRole('button', { name: 'Empty the cart' }).click();
}

async function orderCalabresa(page: Page, paymentToken: string): Promise<string> {
  await page.goto(`/restaurants/${restaurantId}`);
  await page.getByRole('button', { name: 'Add Calabresa to the cart' }).click();
  await page.getByRole('link', { name: 'Cart' }).click();
  await expect(page.getByRole('region', { name: 'Cart' })).toContainText('Total R$52.00');
  const storedCart = await page.evaluate(`localStorage.getItem('${cartStorageKey}')`);
  await placeCart(page, paymentToken);
  return z.string().parse(storedCart);
}

async function placeStoredCartAgain(
  page: Page,
  storedCart: string,
  paymentToken: string,
): Promise<void> {
  await page.evaluate(`localStorage.setItem('${cartStorageKey}', ${JSON.stringify(storedCart)})`);
  await page.goto('/cart');
  await placeCart(page, paymentToken);
}

async function expectNoFurtherReload(page: Page): Promise<void> {
  const html = await (await page.request.get(page.url())).text();
  expect(html).not.toContain('http-equiv="refresh"');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  restaurantId = await openSearchablePizzeria();
});

test('finds a restaurant by a misspelled dish and opens its menu without signing in, in pages no other site can frame', async ({
  page,
}) => {
  const searchPage = await page.goto('/');
  expect(searchPage?.headers()['x-frame-options']).toBe('DENY');
  await page.getByLabel('Restaurant or dish').fill(misspelledDishWord);
  await page.getByRole('button', { name: 'Search' }).click();

  const hit = page
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href="/restaurants/${restaurantId}"]`) });
  await expect(hit).toContainText(dishName);
  await expect(hit.locator('mark')).toHaveText(dishWord);
  await expect(page.locator('main u')).toHaveCount(0);
  await hit.getByRole('link', { name: 'Pizzaria Bella' }).click();
  await expect(page.getByRole('heading', { name: 'Pizzaria Bella' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Menu' })).toContainText(`${dishName} R$45.00`);
  expect(await page.context().cookies(siteUrl)).toEqual([]);
});

test('registers, keeps a refused cart, orders with an approved card sent twice and a declined card, and keeps every token on the server', async ({
  page,
}) => {
  const { username } = await administration.createConsumer();
  const tokens = watchForTokens(page);
  await page.goto('/profile');
  await signIn(page, username);
  await fillFields(page, [
    ['Name', 'Bruna Lima'],
    ['Email', `${username}@food-delivery.test`],
    ...deliveryAddressFields,
  ]);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(page.getByRole('definition')).toContainText(['Bruna Lima']);
  await keepRefusedCart(page);

  const approvedCart = await orderCalabresa(page, 'tok_visa_0001');
  await expect(page.locator('main strong')).toHaveText('APPROVED', {
    timeout: statusTimeoutInMilliseconds,
  });
  await expect(page.getByText('Delivery fee R$8.00')).toBeVisible();
  await expect(page.getByText('Total R$60.00')).toBeVisible();
  await expectNoFurtherReload(page);
  const approvedOrderUrl = page.url();
  await placeStoredCartAgain(page, approvedCart, 'tok_visa_0001');
  await expect(page).toHaveURL(approvedOrderUrl);

  await orderCalabresa(page, 'tok_visa_0002');
  await expect(page.locator('main strong')).toHaveText('REJECTED', {
    timeout: statusTimeoutInMilliseconds,
  });
  await expect(page.locator('main').getByRole('alert')).toHaveText(
    'The card was declined. (PAYMENT_DECLINED)',
  );
  await expectNoFurtherReload(page);

  const sessionCookie = (await page.context().cookies(siteUrl)).find(
    (cookie) => cookie.name === 'consumer-web-session',
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  const cookieLifetimeInSeconds =
    (sessionCookie?.expires ?? 0) - Date.now() / millisecondsPerSecond;
  expect(cookieLifetimeInSeconds).toBeGreaterThan(accessTokenLifetimeInSeconds);
  expect(cookieLifetimeInSeconds).toBeLessThanOrEqual(keycloakSessionIdleTimeInSeconds);
  expect(sessionCookie?.value).not.toMatch(jsonWebTokenPattern);
  expect(await page.evaluate('document.cookie')).toBe('');
  expect(await tokens.sightings()).toEqual([]);
});

test('refuses a sign-out sent from another site and signs out of Keycloak too, so the next visit asks for the password again', async ({
  page,
}) => {
  const { username } = await administration.createConsumer();
  await page.goto('/profile');
  await signIn(page, username);
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
  const forgedSignOut = await page.request.post('/auth/logout', {
    headers: { origin: 'http://evil.example' },
    maxRedirects: 0,
  });
  expect(forgedSignOut.status()).toBe(403);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(await page.context().cookies(siteUrl)).toEqual([]);
  await page.goto('/profile');
  await expect(page.locator('#password')).toBeVisible();
});
