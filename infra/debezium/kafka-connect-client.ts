import { setTimeout } from 'node:timers/promises';
import type { ConnectorConfiguration } from './outbox-connector-configuration.ts';

const pollIntervalInMilliseconds = 1000;
const stateTimeoutInMilliseconds = 60_000;

function readState(component: unknown): string | undefined {
  if (typeof component !== 'object' || component === null || !('state' in component))
    return undefined;
  return typeof component.state === 'string' ? component.state : undefined;
}

async function waitUntil(condition: () => Promise<boolean>, failureMessage: string): Promise<void> {
  const deadline = Date.now() + stateTimeoutInMilliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await setTimeout(pollIntervalInMilliseconds);
  }
  throw new Error(failureMessage);
}

export class KafkaConnectClient {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl;
  }

  async putConnectorConfiguration(
    name: string,
    configuration: ConnectorConfiguration,
  ): Promise<void> {
    await this.#request(`/connectors/${name}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configuration),
    });
  }

  async waitForConnectorRunning(name: string): Promise<void> {
    await waitUntil(async () => {
      const [connectorState, ...taskStates] = await this.#readConnectorStates(name);
      const isEveryTaskRunning =
        taskStates.length > 0 && taskStates.every((state) => state === 'RUNNING');
      return connectorState === 'RUNNING' && isEveryTaskRunning;
    }, `connector ${name} is not RUNNING; see ${this.#baseUrl}/connectors/${name}/status`);
  }

  async removeConnector(name: string): Promise<void> {
    const connectorResponse = await fetch(`${this.#baseUrl}/connectors/${name}`);
    await connectorResponse.body?.cancel();
    if (connectorResponse.status === 404) return;
    await this.#request(`/connectors/${name}/stop`, { method: 'PUT' });
    await waitUntil(async () => {
      const [connectorState] = await this.#readConnectorStates(name);
      return connectorState === 'STOPPED';
    }, `connector ${name} did not stop`);
    await this.#request(`/connectors/${name}/offsets`, { method: 'DELETE' });
    await this.#request(`/connectors/${name}`, { method: 'DELETE' });
  }

  async #request(path: string, requestOptions: RequestInit): Promise<Response> {
    const response = await fetch(`${this.#baseUrl}${path}`, requestOptions);
    if (!response.ok) {
      const method = requestOptions.method ?? 'GET';
      const reason = await response.text();
      throw new Error(
        `Kafka Connect ${method} ${path} failed with ${String(response.status)}: ${reason}`,
      );
    }
    return response;
  }

  async #readConnectorStates(name: string): Promise<readonly (string | undefined)[]> {
    const response = await fetch(`${this.#baseUrl}/connectors/${name}/status`);
    if (!response.ok) {
      await response.text();
      return [];
    }
    const status: unknown = await response.json();
    if (typeof status !== 'object' || status === null) return [];
    const tasks = 'tasks' in status && Array.isArray(status.tasks) ? status.tasks : [];
    return [
      'connector' in status ? readState(status.connector) : undefined,
      ...tasks.map(readState),
    ];
  }
}
