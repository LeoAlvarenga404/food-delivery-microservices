const bearerAuthorization = /^Bearer +(\S+)$/i;

export function readBearerToken(authorization: string | null | undefined): string | undefined {
  return bearerAuthorization.exec(authorization ?? '')?.[1];
}
