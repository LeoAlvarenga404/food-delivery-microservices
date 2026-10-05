'use server';

import {
  createConsumerApi,
  sendOrderPlacement,
  type OrderPlacement,
  type PlacementResult,
} from '../consumer-api/consumer-api.adapter.ts';
import { readAccessToken } from '../session/session-cookie.adapter.ts';

export async function placeOrder(placement: OrderPlacement): Promise<PlacementResult> {
  const accessToken = await readAccessToken();
  if (accessToken === undefined) return { isSignInRequired: true };
  return sendOrderPlacement(createConsumerApi(accessToken), placement);
}
