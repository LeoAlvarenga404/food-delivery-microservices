import createClient, { type Client } from 'openapi-fetch';
import { readConsumerWebConfiguration } from '../consumer-web.config.ts';
import type { paths } from '../generated/consumer-api.ts';
import { describeProblem } from './consumer-api-view.message-mapper.ts';

export type ConsumerApi = Client<paths>;

export type ConsumerRegistration =
  paths['/v1/consumers/me']['post']['requestBody']['content']['application/json'];

export type Refusal = { readonly problem: string } | { readonly isSignInRequired: true };

export type RegistrationResult = { readonly consumerId: string } | Refusal;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(candidate: string): boolean {
  return uuidPattern.test(candidate);
}

export function createConsumerApi(accessToken?: string): ConsumerApi {
  const { consumerApiUrl } = readConsumerWebConfiguration(process.env);
  return createClient<paths>({
    baseUrl: consumerApiUrl,
    headers: accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` },
  });
}

function toRefusal(response: Response, problem: { readonly reason?: string } | undefined): Refusal {
  if (response.status === 401) return { isSignInRequired: true };
  return { problem: describeProblem(response.status, problem?.reason) };
}

export async function sendConsumerRegistration(
  api: ConsumerApi,
  registration: ConsumerRegistration,
): Promise<RegistrationResult> {
  const {
    data: registered,
    error,
    response,
  } = await api.POST('/v1/consumers/me', {
    body: registration,
  });
  return registered === undefined
    ? toRefusal(response, error)
    : { consumerId: registered.consumerId };
}
