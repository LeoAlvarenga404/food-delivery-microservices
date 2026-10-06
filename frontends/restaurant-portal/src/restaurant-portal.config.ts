import { z } from 'zod';

export interface RestaurantPortalConfiguration {
  readonly keycloakIssuerUrl: string;
}

const environmentSchema = z.object({ VITE_KEYCLOAK_ISSUER_URL: z.url() });

export function readRestaurantPortalConfiguration(
  environment: Readonly<Record<string, unknown>>,
): RestaurantPortalConfiguration {
  const variables = environmentSchema.parse(environment);
  return { keycloakIssuerUrl: variables.VITE_KEYCLOAK_ISSUER_URL };
}
