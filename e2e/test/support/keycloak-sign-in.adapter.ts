import { z } from 'zod';

interface SignedIn {
  readonly accessToken: string;
  readonly renewAtInMilliseconds: number;
}

const accessTokenField = 'access_token';
const expiresInField = 'expires_in';
const tokenResponseSchema = z.object({
  [accessTokenField]: z.string().min(1),
  [expiresInField]: z.number().int().positive(),
});
const renewalMarginInMilliseconds = 30_000;

export class KeycloakSignIn {
  readonly #username: string;
  readonly #tokenUrl: string;
  #signedIn: SignedIn | undefined = undefined;

  constructor(
    username: string,
    tokenUrl = process.env['E2E_TOKEN_URL'] ??
      'http://127.0.0.1:8180/realms/food-delivery/protocol/openid-connect/token',
  ) {
    this.#username = username;
    this.#tokenUrl = tokenUrl;
  }

  async accessToken(): Promise<string> {
    if (this.#signedIn !== undefined && Date.now() < this.#signedIn.renewAtInMilliseconds) {
      return this.#signedIn.accessToken;
    }
    const signedInAtInMilliseconds = Date.now();
    const response = await fetch(this.#tokenUrl, {
      method: 'POST',
      body: new URLSearchParams([
        ['grant_type', 'password'],
        ['client_id', 'e2e'],
        ['username', this.#username],
        ['password', `${this.#username}-password`],
      ]),
    });
    if (!response.ok) {
      throw new Error(`${this.#username} could not sign in: HTTP ${String(response.status)}`);
    }
    const signedIn = tokenResponseSchema.parse(await response.json());
    const lifetimeInMilliseconds = signedIn[expiresInField] * 1_000 - renewalMarginInMilliseconds;
    this.#signedIn = {
      accessToken: signedIn[accessTokenField],
      renewAtInMilliseconds: signedInAtInMilliseconds + lifetimeInMilliseconds,
    };
    return this.#signedIn.accessToken;
  }
}
