import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../generated/restaurant-api.ts';
import { describeProblem } from './restaurant-api-view.message-mapper.ts';

export type RestaurantApi = Client<paths>;

export type Onboarding =
  paths['/v1/restaurant/restaurants']['post']['requestBody']['content']['application/json'];

export type RestaurantView =
  paths['/v1/restaurant/restaurants/{restaurantId}']['get']['responses'][200]['content']['application/json'];

export type MenuItem = RestaurantView['menuItems'][number];

export type Memberships =
  paths['/v1/restaurant/memberships']['get']['responses'][200]['content']['application/json'];

export interface Refusal {
  readonly problem: string;
}

type Problem = { readonly reason?: string } | undefined;

function toRefusal(response: Response, problem: Problem): Refusal {
  return { problem: describeProblem(response.status, problem?.reason) };
}

export function problemOf(result: object | undefined): string | undefined {
  if (result === undefined || !('problem' in result)) return undefined;
  return typeof result.problem === 'string' ? result.problem : undefined;
}

export function createRestaurantApi(baseUrl: string, accessToken: string): RestaurantApi {
  return createClient<paths>({ baseUrl, headers: { authorization: `Bearer ${accessToken}` } });
}

export async function listMemberships(api: RestaurantApi): Promise<Memberships | Refusal> {
  const { data: memberships, error, response } = await api.GET('/v1/restaurant/memberships');
  return memberships ?? toRefusal(response, error);
}

export async function onboardRestaurant(
  api: RestaurantApi,
  onboarding: Onboarding,
): Promise<{ readonly restaurantId: string } | Refusal> {
  const {
    data: onboarded,
    error,
    response,
  } = await api.POST('/v1/restaurant/restaurants', { body: onboarding });
  return onboarded ?? toRefusal(response, error);
}

export async function readRestaurant(
  api: RestaurantApi,
  restaurantId: string,
): Promise<RestaurantView | Refusal> {
  const {
    data: restaurant,
    error,
    response,
  } = await api.GET('/v1/restaurant/restaurants/{restaurantId}', {
    params: { path: { restaurantId } },
  });
  return restaurant ?? toRefusal(response, error);
}

export async function reviseMenu(
  api: RestaurantApi,
  restaurantId: string,
  menuItems: readonly MenuItem[],
): Promise<{ readonly version: number } | Refusal> {
  const {
    data: revised,
    error,
    response,
  } = await api.PUT('/v1/restaurant/restaurants/{restaurantId}/menu', {
    params: { path: { restaurantId } },
    body: { menuItems: [...menuItems] },
  });
  return revised ?? toRefusal(response, error);
}
