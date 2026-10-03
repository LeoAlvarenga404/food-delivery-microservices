import { setTimeout } from 'node:timers/promises';
import type { ConnectorConfiguration } from './outbox-connector-configuration.ts';

interface ComponentStatus {
  readonly state: string | undefined;
  readonly trace: string | undefined;
}

const pollIntervalInMilliseconds = 1000;
const stateTimeoutInMilliseconds = 60_000;

function readComponent(component: unknown): ComponentStatus {
  if (typeof component !== 'object' || component === null) {
    return { state: undefined, trace: undefined };
  }
  return {
    state:
      'state' in component && typeof component.state === 'string' ? component.state : undefined,
    trace:
      'trace' in component && typeof component.trace === 'string' ? component.trace : undefined,
  };
}

function failureOf(name: string, components: readonly ComponentStatus[]): Error | undefined {
  const traces = components
    .filter((component) => component.state === 'FAILED')
    .map((component) => component.trace ?? 'no trace reported');
  return traces.length === 0
    ? undefined
    : new Error(`connector ${name} FAILED:\n${traces.join('\n')}`);
}

async function waitUntil(
  condition: () => Promise<boolean>,
  failureMessage: () => string,
): Promise<void> {
  const deadline = Date.now() + stateTimeoutInMilliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await setTimeout(pollIntervalInMilliseconds);
  }
  throw new Error(failureMessage());
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

  async restartFailedTasks(name: string): Promise<void> {
    const components = await this.#readConnectorStatus(name);
    if (failureOf(name, components) === undefined) return;
    const response = await this.#request(
      `/connectors/${name}/restart?includeTasks=true&onlyFailed=true`,
      { method: 'POST' },
    );
    await response.body?.cancel();
  }

  async waitForConnectorRunning(name: string): Promise<void> {
    let previousFailure: Error | undefined;
    await waitUntil(
      async () => {
        const components = await this.#readConnectorStatus(name);
        const failure = failureOf(name, components);
        if (failure !== undefined && previousFailure !== undefined) throw failure;
        previousFailure = failure;
        const [connector, ...tasks] = components;
        const isEveryTaskRunning =
          tasks.length > 0 && tasks.every((task) => task.state === 'RUNNING');
        return connector?.state === 'RUNNING' && isEveryTaskRunning;
      },
      () => {
        const lastFailure = previousFailure === undefined ? '' : `\n${previousFailure.message}`;
        return `connector ${name} is not RUNNING; see ${this.#baseUrl}/connectors/${name}/status${lastFailure}`;
      },
    );
  }

  async removeConnectorAndOffsets(name: string): Promise<void> {
    const connectorResponse = await fetch(`${this.#baseUrl}/connectors/${name}`);
    await connectorResponse.body?.cancel();
    if (connectorResponse.status === 404) return;
    await this.#request(`/connectors/${name}/stop`, { method: 'PUT' });
    await waitUntil(
      async () => {
        const [connector] = await this.#readConnectorStatus(name);
        return connector?.state === 'STOPPED';
      },
      () => `connector ${name} did not stop`,
    );
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

  async #readConnectorStatus(name: string): Promise<readonly ComponentStatus[]> {
    const response = await fetch(`${this.#baseUrl}/connectors/${name}/status`);
    if (!response.ok) {
      await response.text();
      return [];
    }
    const status: unknown = await response.json();
    if (typeof status !== 'object' || status === null) return [];
    const tasks = 'tasks' in status && Array.isArray(status.tasks) ? status.tasks : [];
    return [
      readComponent('connector' in status ? status.connector : undefined),
      ...tasks.map(readComponent),
    ];
  }
}
