export interface ConsumerWebConfiguration {
  readonly consumerApiUrl: string;
  readonly publicUrl: string;
  readonly keycloakIssuerUrl: string;
  readonly keycloakTokenUrl: string;
  readonly clientSecret: string;
  readonly sessionSecret: string;
}

const minimumSessionSecretLength = 32;

function requireVariable(environment: NodeJS.ProcessEnv, name: string): string {
  const variable = environment[name];
  if (variable === undefined || variable === '') throw new Error(`${name} is required`);
  return variable;
}

export function readConsumerWebConfiguration(
  environment: NodeJS.ProcessEnv,
): ConsumerWebConfiguration {
  const sessionSecret = requireVariable(environment, 'CONSUMER_WEB_SESSION_SECRET');
  if (sessionSecret.length < minimumSessionSecretLength) {
    throw new Error('CONSUMER_WEB_SESSION_SECRET needs at least 32 characters');
  }
  return {
    consumerApiUrl: requireVariable(environment, 'CONSUMER_API_URL'),
    publicUrl: requireVariable(environment, 'CONSUMER_WEB_PUBLIC_URL'),
    keycloakIssuerUrl: requireVariable(environment, 'KEYCLOAK_ISSUER_URL'),
    keycloakTokenUrl: requireVariable(environment, 'KEYCLOAK_TOKEN_URL'),
    clientSecret: requireVariable(environment, 'CONSUMER_WEB_CLIENT_SECRET'),
    sessionSecret,
  };
}
