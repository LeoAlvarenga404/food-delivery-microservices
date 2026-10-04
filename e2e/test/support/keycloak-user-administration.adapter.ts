import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const accessTokenField = 'access_token';
const adminTokenSchema = z.object({ [accessTokenField]: z.string().min(1) });
const realmRoleSchema = z.object({ id: z.string(), name: z.string() });
const stackEnvironmentFile = new URL('../../../infra/.env', import.meta.url);

function readAdminPassword(): string {
  const password = parseEnv(readFileSync(stackEnvironmentFile, 'utf8'))['KEYCLOAK_ADMIN_PASSWORD'];
  if (password === undefined) throw new Error('infra/.env has no KEYCLOAK_ADMIN_PASSWORD');
  return password;
}

function requireStatus(response: Response, status: number): Response {
  if (response.status !== status) {
    throw new Error(`${response.url} answered HTTP ${String(response.status)}`);
  }
  return response;
}

export interface CreatedConsumer {
  readonly username: string;
  readonly subject: string;
}

export class KeycloakUserAdministration {
  readonly #baseUrl: string;

  constructor(baseUrl = process.env['E2E_KEYCLOAK_URL'] ?? 'http://127.0.0.1:8180') {
    this.#baseUrl = baseUrl;
  }

  async createConsumer(): Promise<CreatedConsumer> {
    const username = `consumer-${randomUUID()}`;
    const headers = {
      authorization: `Bearer ${await this.#adminToken()}`,
      'content-type': 'application/json',
    };
    const created = requireStatus(
      await fetch(`${this.#realmUrl()}/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username,
          enabled: true,
          email: `${username}@food-delivery.test`,
          emailVerified: true,
          firstName: 'New',
          lastName: 'Consumer',
          credentials: [{ type: 'password', value: `${username}-password`, temporary: false }],
        }),
      }),
      201,
    );
    const userUrl = created.headers.get('location') ?? '';
    await this.#grantConsumerRole(userUrl, headers);
    return { username, subject: userUrl.slice(userUrl.lastIndexOf('/') + 1) };
  }

  async #grantConsumerRole(userUrl: string, headers: Record<string, string>): Promise<void> {
    const role = requireStatus(await fetch(`${this.#realmUrl()}/roles/consumer`, { headers }), 200);
    requireStatus(
      await fetch(`${userUrl}/role-mappings/realm`, {
        method: 'POST',
        headers,
        body: JSON.stringify([realmRoleSchema.parse(await role.json())]),
      }),
      204,
    );
  }

  async #adminToken(): Promise<string> {
    const response = await fetch(`${this.#baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams([
        ['grant_type', 'password'],
        ['client_id', 'admin-cli'],
        ['username', 'admin'],
        ['password', readAdminPassword()],
      ]),
    });
    const token = adminTokenSchema.parse(await requireStatus(response, 200).json());
    return token[accessTokenField];
  }

  #realmUrl(): string {
    return `${this.#baseUrl}/admin/realms/food-delivery`;
  }
}
