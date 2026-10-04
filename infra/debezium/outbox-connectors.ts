import type { OutboxConnectorTarget } from './outbox-connector-configuration.ts';

export interface OutboxConnector extends OutboxConnectorTarget {
  readonly connectorName: string;
}

function serviceOutboxConnector(serviceName: string): OutboxConnector {
  return {
    connectorName: `${serviceName}-outbox`,
    databaseHost: `${serviceName}-db`,
    databaseName: `${serviceName}_service`,
    databaseUser: `${serviceName}_service`,
    passwordEnvironmentVariable: `${serviceName.toUpperCase()}_DB_PASSWORD`,
    slotName: `${serviceName}_outbox`,
    topicPrefix: serviceName,
  };
}

export const outboxConnectors: readonly OutboxConnector[] = [
  'order',
  'consumer',
  'kitchen',
  'accounting',
  'restaurant',
].map(serviceOutboxConnector);
