import createClient, { type Client } from 'openapi-fetch';
import { readConsumerWebConfiguration } from '../consumer-web.config.ts';
import type { paths } from '../generated/consumer-api.ts';

export type ConsumerApi = Client<paths>;

export function createConsumerApi(accessToken?: string): ConsumerApi {
  const { consumerApiUrl } = readConsumerWebConfiguration(process.env);
  return createClient<paths>({
    baseUrl: consumerApiUrl,
    headers: accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` },
  });
}
