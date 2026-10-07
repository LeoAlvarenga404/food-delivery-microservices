import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';
import { z } from 'zod';
import { HttpConsumerApi, openPizzeria } from '../test/support/http-consumer-api.adapter.ts';

const displayUrl = process.env['E2E_KITCHEN_URL'] ?? 'http://kitchen.localhost:8080';
const siteUrl = process.env['E2E_SITE_URL'] ?? 'http://localhost:8080';
const contentSecurityPolicy =
  "default-src 'self'; connect-src 'self' http://localhost:8180; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const jsonWebTokenPattern = /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/;
const authorizationUrl = 'http://localhost:8180/realms/food-delivery/protocol/openid-connect/auth';
const tokenUrl = 'http://localhost:8180/realms/food-delivery/protocol/openid-connect/token';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const orderFields: readonly (readonly [string, string])[] = [
  ['Street', 'Rua Augusta'],
  ['Number', '1500'],
  ['City', 'Sao Paulo'],
  ['Postal code', '01304-001'],
  ['Card token', 'tok_visa_0001'],
];
const statusTimeoutInMilliseconds = 60_000;
const twoMinutesInMilliseconds = 120_000;
const acceptedTicketSchema = z.object({ status: z.literal('ACCEPTED'), readyBy: z.iso.datetime() });
let restaurantId: string;

async function requestCode(
  request: APIRequestContext,
  parameters: readonly (readonly [string, string])[],
): Promise<APIResponse> {
  const query = new URLSearchParams([
    ['client_id', 'kitchen-display'],
    ['response_type', 'code'],
    ['scope', 'openid'],
  ]);
  for (const [name, text] of parameters) query.append(name, text);
  return request.get(`${authorizationUrl}?${query.toString()}`, { maxRedirects: 0 });
}

function readRedirectError(response: APIResponse): string | null {
  return new URL(response.headers()['location'] ?? displayUrl).searchParams.get('error');
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(`${username}-password`);
  await page.locator('#kc-login').click();
}

async function orderCalabresaOnTheConsumerSite(page: Page): Promise<string> {
  await page.goto(`${siteUrl}/profile`);
  await signIn(page, 'consumer-a');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await page.goto(`${siteUrl}/restaurants/${restaurantId}`);
  await page.getByRole('button', { name: 'Add Calabresa to the cart' }).click();
  await page.getByRole('link', { name: 'Cart' }).click();
  for (const [label, text] of orderFields) {
    await page.getByLabel(label, { exact: true }).fill(text);
  }
  await page.getByRole('button', { name: 'Place the order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.locator('main strong')).toHaveText('APPROVED', {
    timeout: statusTimeoutInMilliseconds,
  });
  return z.uuid().parse(new URL(page.url()).pathname.split('/').at(-1));
}

function ticketIn(page: Page, kitchenStep: string, orderId: string): Locator {
  return page
    .getByRole('region', { name: kitchenStep })
    .getByRole('article', { name: `Order ${orderId}` });
}

async function acceptForTwoMinutes(page: Page, orderId: string): Promise<string> {
  const ticket = ticketIn(page, 'Awaiting acceptance', orderId);
  await ticket.getByLabel('Preparation time in minutes').fill('2');
  const queueRefresh = Promise.withResolvers<undefined>();
  await page.route('**/tickets', async (route) => {
    await queueRefresh.promise;
    await route.continue();
  });
  const answering = page.waitForResponse((response) => response.url().endsWith('/acceptance'));
  await ticket.getByRole('button', { name: 'Accept' }).click();
  const answer = await answering;
  await page.waitForTimeout(1_000);
  expect(await ticket.getByRole('button', { name: 'Accept' }).isDisabled()).toBe(true);
  queueRefresh.resolve(undefined);
  await page.unrouteAll({ behavior: 'wait' });
  const { readyBy } = acceptedTicketSchema.parse(await answer.json());
  const preparationTimeInMilliseconds =
    Date.parse(readyBy) - Date.parse(answer.headers()['date'] ?? '');
  expect(preparationTimeInMilliseconds).toBeGreaterThan(twoMinutesInMilliseconds - 5_000);
  expect(preparationTimeInMilliseconds).toBeLessThanOrEqual(twoMinutesInMilliseconds + 5_000);
  return page.evaluate(
    (instant) =>
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(instant),
      ),
    readyBy,
  );
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await new HttpConsumerApi('consumer-a').waitUntilReachableAndRegistered();
  ({ restaurantId } = await openPizzeria());
});

test('lets Keycloak send a code only to the kitchen display itself and only for a PKCE S256 challenge', async ({
  request,
}) => {
  const displayRedirect: readonly [string, string] = ['redirect_uri', `${displayUrl}/`];
  const s256Challenge: readonly (readonly [string, string])[] = [
    ['code_challenge', codeChallenge],
    ['code_challenge_method', 'S256'],
  ];

  const atTheDisplay = await requestCode(request, [displayRedirect, ...s256Challenge]);
  const withoutChallenge = await requestCode(request, [displayRedirect]);
  const withPlainChallenge = await requestCode(request, [
    displayRedirect,
    ['code_challenge', codeChallenge],
    ['code_challenge_method', 'plain'],
  ]);
  const elsewhere = await requestCode(request, [
    ['redirect_uri', `${displayUrl}/elsewhere`],
    ...s256Challenge,
  ]);

  expect(atTheDisplay.status()).toBe(200);
  expect(readRedirectError(withoutChallenge)).toBe('invalid_request');
  expect(readRedirectError(withPlainChallenge)).toBe('invalid_request');
  expect(elsewhere.status()).toBe(400);
});

test('shows a ticket ordered on the consumer site as it arrives and takes it to ready for pickup, keeping every token in memory', async ({
  page,
  browser,
}) => {
  const displayResponse = await page.goto(displayUrl);
  expect(displayResponse?.headers()['content-security-policy']).toBe(contentSecurityPolicy);
  const tokenAnswering = page.waitForResponse(
    (response) => response.url() === tokenUrl && response.request().method() === 'POST',
  );
  await signIn(page, 'staff-a');
  const tokenAnswer = await (await tokenAnswering).text();
  expect(tokenAnswer).toContain('"access_token"');
  expect(tokenAnswer).not.toContain('"refresh_token"');
  await page.locator(`a[href="/restaurants/${restaurantId}"]`).click();
  await expect(page.getByRole('region', { name: 'Awaiting acceptance' })).toContainText(
    'No tickets.',
  );

  const orderId = await orderCalabresaOnTheConsumerSite(await browser.newPage());
  await expect(ticketIn(page, 'Awaiting acceptance', orderId)).toContainText('1 x Calabresa', {
    timeout: statusTimeoutInMilliseconds,
  });
  const readyByText = await acceptForTwoMinutes(page, orderId);
  const accepted = ticketIn(page, 'Accepted', orderId);
  await expect(accepted).toContainText(`Ready by ${readyByText}`);
  await accepted.getByRole('button', { name: 'Start preparing' }).click();
  await ticketIn(page, 'Preparing', orderId).getByRole('button', { name: 'Mark ready' }).click();
  await expect(ticketIn(page, 'Ready for pickup', orderId)).toContainText(
    'Waiting for the courier.',
  );

  expect(await page.evaluate('JSON.stringify([localStorage, sessionStorage])')).not.toMatch(
    jsonWebTokenPattern,
  );
  expect(await page.context().cookies(displayUrl)).toEqual([]);
});

test('refuses a staff member of another restaurant and signs out of Keycloak too', async ({
  page,
}) => {
  const queueUrl = `${displayUrl}/restaurants/${restaurantId}`;
  await page.goto(queueUrl);
  await signIn(page, 'staff-b');
  await expect(page).toHaveURL(queueUrl);
  await expect(page.getByRole('alert')).toHaveText('You are not a member of this restaurant.');
  await expect(page.getByRole('heading', { name: 'Kitchen queue' })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Your restaurants' }).click();
  await expect(page.getByRole('heading', { name: 'Your restaurants' })).toBeVisible();
  await expect(page.locator(`a[href="/restaurants/${restaurantId}"]`)).toHaveCount(0);

  await page.getByRole('link', { name: 'Sign out' }).click();
  await expect(page.locator('#password')).toBeVisible();
});
