import { describe, expect, it } from 'vitest';
import { outboxConnectors } from './outbox-connectors.ts';

describe('outboxConnectors', () => {
  it('relays the outbox of every service database through its own slot and password', () => {
    expect(outboxConnectors).toEqual([
      {
        connectorName: 'order-outbox',
        databaseHost: 'order-db',
        databaseName: 'order_service',
        databaseUser: 'order_service',
        passwordEnvironmentVariable: 'ORDER_DB_PASSWORD',
        slotName: 'order_outbox',
        topicPrefix: 'order',
      },
      {
        connectorName: 'consumer-outbox',
        databaseHost: 'consumer-db',
        databaseName: 'consumer_service',
        databaseUser: 'consumer_service',
        passwordEnvironmentVariable: 'CONSUMER_DB_PASSWORD',
        slotName: 'consumer_outbox',
        topicPrefix: 'consumer',
      },
      {
        connectorName: 'kitchen-outbox',
        databaseHost: 'kitchen-db',
        databaseName: 'kitchen_service',
        databaseUser: 'kitchen_service',
        passwordEnvironmentVariable: 'KITCHEN_DB_PASSWORD',
        slotName: 'kitchen_outbox',
        topicPrefix: 'kitchen',
      },
      {
        connectorName: 'accounting-outbox',
        databaseHost: 'accounting-db',
        databaseName: 'accounting_service',
        databaseUser: 'accounting_service',
        passwordEnvironmentVariable: 'ACCOUNTING_DB_PASSWORD',
        slotName: 'accounting_outbox',
        topicPrefix: 'accounting',
      },
      {
        connectorName: 'restaurant-outbox',
        databaseHost: 'restaurant-db',
        databaseName: 'restaurant_service',
        databaseUser: 'restaurant_service',
        passwordEnvironmentVariable: 'RESTAURANT_DB_PASSWORD',
        slotName: 'restaurant_outbox',
        topicPrefix: 'restaurant',
      },
    ]);
  });
});
