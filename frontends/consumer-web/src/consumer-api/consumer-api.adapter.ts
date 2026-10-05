import createClient, { type Client } from 'openapi-fetch';
import { readConsumerWebConfiguration } from '../consumer-web.config.ts';
import type { paths } from '../generated/consumer-api.ts';

export type ConsumerApi = Client<paths>;

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
