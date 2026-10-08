import { z } from 'zod';

export interface KitchenDisplayConfiguration {
  readonly keycloakIssuerUrl: string;
}

const environmentSchema = z.object({ VITE_KEYCLOAK_ISSUER_URL: z.url() });

export function readKitchenDisplayConfiguration(
  environment: Readonly<Record<string, unknown>>,
): KitchenDisplayConfiguration {
  const variables = environmentSchema.parse(environment);
  return { keycloakIssuerUrl: variables.VITE_KEYCLOAK_ISSUER_URL };
}
