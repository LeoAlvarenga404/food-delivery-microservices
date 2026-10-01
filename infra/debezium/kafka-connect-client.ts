import { setTimeout } from 'node:timers/promises';
import type { ConnectorConfiguration } from './outbox-connector-configuration.ts';

const kafkaConnectUrl = 'http://localhost:8083';
const pollIntervalInMilliseconds = 1000;
const stateTimeoutInMilliseconds = 60_000;

async function requestKafkaConnect(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${kafkaConnectUrl}${path}`, init);
  if (!response.ok) {
    const method = init.method ?? 'GET';
    const reason = await response.text();
    throw new Error(
      `Kafka Connect ${method} ${path} failed with ${String(response.status)}: ${reason}`,
    );
  }
  return response;
}

function readState(component: unknown): string | undefined {
  if (typeof component !== 'object' || component === null || !('state' in component))
    return undefined;
  return typeof component.state === 'string' ? component.state : undefined;
}

async function readConnectorStates(name: string): Promise<readonly (string | undefined)[]> {
  const response = await fetch(`${kafkaConnectUrl}/connectors/${name}/status`);
  if (!response.ok) return [];
  const status: unknown = await response.json();
  if (typeof status !== 'object' || status === null) return [];
  const tasks = 'tasks' in status && Array.isArray(status.tasks) ? status.tasks : [];
  return ['connector' in status ? readState(status.connector) : undefined, ...tasks.map(readState)];
}

async function waitUntil(condition: () => Promise<boolean>, failureMessage: string): Promise<void> {
  const deadline = Date.now() + stateTimeoutInMilliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await setTimeout(pollIntervalInMilliseconds);
  }
  throw new Error(failureMessage);
}

export async function putConnectorConfiguration(
  name: string,
  configuration: ConnectorConfiguration,
): Promise<void> {
  await requestKafkaConnect(`/connectors/${name}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configuration),
  });
}

export async function waitForConnectorRunning(name: string): Promise<void> {
  await waitUntil(async () => {
    const [connectorState, ...taskStates] = await readConnectorStates(name);
    const isEveryTaskRunning =
      taskStates.length > 0 && taskStates.every((state) => state === 'RUNNING');
    return connectorState === 'RUNNING' && isEveryTaskRunning;
  }, `connector ${name} is not RUNNING; see ${kafkaConnectUrl}/connectors/${name}/status`);
}

export async function removeConnector(name: string): Promise<void> {
  const existing = await fetch(`${kafkaConnectUrl}/connectors/${name}`);
  if (existing.status === 404) return;
  await requestKafkaConnect(`/connectors/${name}/stop`, { method: 'PUT' });
  await waitUntil(async () => {
    const [connectorState] = await readConnectorStates(name);
    return connectorState === 'STOPPED';
  }, `connector ${name} did not stop`);
  await requestKafkaConnect(`/connectors/${name}/offsets`, { method: 'DELETE' });
  await requestKafkaConnect(`/connectors/${name}`, { method: 'DELETE' });
}
