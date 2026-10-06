import { randomBytes } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

const portalUrl = process.env['E2E_PORTAL_URL'] ?? 'http://portal.localhost:8080';
const siteUrl = process.env['E2E_SITE_URL'] ?? 'http://localhost:8080';
const contentSecurityPolicy =
  "default-src 'self'; connect-src 'self' http://localhost:8180; frame-ancestors 'none'";
const jsonWebTokenPattern = /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/;
const letters = 'abcdefghijklmnopqrstuvwxyz';
const restaurantWord = randomLetters(10);
const restaurantName = `Cantina ${restaurantWord}`;
const dishName = `Lasagna ${restaurantWord}`;
const onboardingFields: readonly (readonly [string, string])[] = [
  ['Name', restaurantName],
  ['Category', 'Italian'],
  ['Street', 'Rua Augusta'],
  ['Number', '1500'],
  ['City', 'Sao Paulo'],
  ['Postal code', '01304-001'],
  ['Latitude', '-23.5614'],
  ['Longitude', '-46.6559'],
  ['Minimum order', '20.00'],
  ['Monday opens at', '11:00'],
  ['Monday closes at', '23:00'],
];
const searchTimeoutInMilliseconds = 60_000;
const authorizationUrl = 'http://localhost:8180/realms/food-delivery/protocol/openid-connect/auth';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
let restaurantUrl: string;

function randomLetters(count: number): string {
  return Array.from(randomBytes(count), (byte) => letters.charAt(byte % letters.length)).join('');
}

async function requestCode(
  request: APIRequestContext,
  parameters: readonly (readonly [string, string])[],
): Promise<APIResponse> {
  const query = new URLSearchParams([
    ['client_id', 'restaurant-portal'],
    ['response_type', 'code'],
    ['scope', 'openid'],
  ]);
  for (const [name, text] of parameters) query.append(name, text);
  return request.get(`${authorizationUrl}?${query.toString()}`, { maxRedirects: 0 });
}

function readRedirectError(response: APIResponse): string | null {
  return new URL(response.headers()['location'] ?? portalUrl).searchParams.get('error');
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

async function onboardRestaurant(page: Page): Promise<void> {
  await page.getByRole('main').getByRole('link', { name: 'Onboard a restaurant' }).click();
  await fillFields(page, onboardingFields);
  await page.getByRole('button', { name: 'Onboard the restaurant' }).click();
  await expect(page).toHaveURL(/\/restaurants\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: restaurantName })).toBeVisible();
}

async function saveMenu(page: Page, expectedStatus: string): Promise<void> {
  await page.getByRole('button', { name: 'Save the menu' }).click();
  await expect(page.getByRole('status')).toHaveText(expectedStatus);
}

async function findOnConsumerSite(page: Page): Promise<void> {
  await expect(async () => {
    await page.goto(`${siteUrl}/?text=${restaurantWord}`);
    await expect(page.getByRole('link', { name: restaurantName })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: searchTimeoutInMilliseconds });
  await page.getByRole('link', { name: restaurantName }).click();
}

test.describe.configure({ mode: 'serial' });

test('lets Keycloak send a code only to the portal itself and only for a PKCE S256 challenge', async ({
  request,
}) => {
  const portalRedirect: readonly [string, string] = ['redirect_uri', `${portalUrl}/`];
  const s256Challenge: readonly (readonly [string, string])[] = [
    ['code_challenge', codeChallenge],
    ['code_challenge_method', 'S256'],
  ];

  const atThePortal = await requestCode(request, [portalRedirect, ...s256Challenge]);
  const withoutChallenge = await requestCode(request, [portalRedirect]);
  const withPlainChallenge = await requestCode(request, [
    portalRedirect,
    ['code_challenge', codeChallenge],
    ['code_challenge_method', 'plain'],
  ]);
  const elsewhere = await requestCode(request, [
    ['redirect_uri', `${portalUrl}/elsewhere`],
    ...s256Challenge,
  ]);

  expect(atThePortal.status()).toBe(200);
  expect(readRedirectError(withoutChallenge)).toBe('invalid_request');
  expect(readRedirectError(withPlainChallenge)).toBe('invalid_request');
  expect(elsewhere.status()).toBe(400);
});

test('onboards a restaurant and revises a price, which the consumer site shows once the snapshot propagates, keeping every token in memory', async ({
  page,
  browser,
}) => {
  const portalPage = await page.goto(portalUrl);
  expect(portalPage?.headers()['content-security-policy']).toBe(contentSecurityPolicy);
  await signIn(page, 'staff-a');
  await expect(page.getByRole('heading', { name: 'Your restaurants' })).toBeVisible();
  await onboardRestaurant(page);
  restaurantUrl = page.url();

  await page.getByRole('button', { name: 'Add an item' }).click();
  await fillFields(page, [
    ['Name of item 1', dishName],
    ['Price of item 1', '39.90'],
  ]);
  await saveMenu(page, 'Menu saved as version 2.');
  await page.getByLabel('Price of item 1', { exact: true }).fill('42.50');
  await saveMenu(page, 'Menu saved as version 3.');
  await page.getByRole('navigation').getByRole('link', { name: 'Your restaurants' }).click();
  await expect(page.getByRole('list', { name: 'Your restaurants' })).toContainText(restaurantName);
  expect(await page.evaluate('JSON.stringify([localStorage, sessionStorage])')).not.toMatch(
    jsonWebTokenPattern,
  );
  expect(await page.context().cookies(portalUrl)).toEqual([]);

  const consumerPage = await browser.newPage();
  await findOnConsumerSite(consumerPage);
  await expect(consumerPage.getByRole('list', { name: 'Menu' })).toContainText(
    `${dishName} R$42.50`,
  );
});

test('refuses a staff member of another restaurant and signs out of Keycloak too', async ({
  page,
}) => {
  await page.goto(restaurantUrl);
  await signIn(page, 'staff-b');
  await expect(page).toHaveURL(restaurantUrl);
  await expect(page.getByRole('alert')).toHaveText('Your account may not open this restaurant.');
  await expect(page.getByRole('button', { name: 'Save the menu' })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Your restaurants' }).click();
  await expect(page.getByRole('heading', { name: 'Your restaurants' })).toBeVisible();
  await expect(page.getByText(restaurantName)).toHaveCount(0);

  await page.getByRole('link', { name: 'Sign out' }).click();
  await expect(page.locator('#password')).toBeVisible();
});
