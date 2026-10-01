import { describe, expect, it } from 'vitest';
import { outboxConnectorConfig } from './outbox-connector-config.ts';

const orderConfig = outboxConnectorConfig({
  databaseHost: 'order-db',
  databaseName: 'order_service',
  databaseUser: 'order_service',
  passwordVariable: 'ORDER_DB_PASSWORD',
  slotName: 'order_outbox',
  topicPrefix: 'order',
});

describe('outboxConnectorConfig', () => {
  it('reads only the outbox table through a pre-created publication', () => {
    expect(orderConfig).toMatchObject({
      'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
      'plugin.name': 'pgoutput',
      'publication.name': 'outbox_publication',
      'publication.autocreate.mode': 'disabled',
      'table.include.list': 'public.outbox',
      'snapshot.mode': 'no_data',
    });
  });

  it('targets the database of one service', () => {
    expect(orderConfig).toMatchObject({
      'database.hostname': 'order-db',
      'database.port': '5432',
      'database.dbname': 'order_service',
      'database.user': 'order_service',
      'slot.name': 'order_outbox',
      'topic.prefix': 'order',
    });
  });

  it('resolves the password from the Kafka Connect environment instead of embedding it', () => {
    expect(orderConfig['database.password']).toBe('${env:ORDER_DB_PASSWORD}');
  });

  it('routes each row to its topic column, keyed by aggregate id, with the raw payload bytes', () => {
    expect(orderConfig).toMatchObject({
      'transforms.outbox.type': 'io.debezium.transforms.outbox.EventRouter',
      'transforms.outbox.route.by.field': 'topic',
      'transforms.outbox.route.topic.replacement': '${routedByValue}',
      'transforms.outbox.table.field.event.key': 'aggregate_id',
      'transforms.outbox.table.field.event.payload': 'payload',
      'key.converter': 'org.apache.kafka.connect.storage.StringConverter',
      'value.converter': 'org.apache.kafka.connect.converters.ByteArrayConverter',
    });
  });

  it('places every message metadata column in a kebab-case header', () => {
    const placements = orderConfig['transforms.outbox.table.fields.additional.placement'];

    expect(placements?.split(',')).toEqual([
      'id:header:message-id',
      'message_type:header:message-type',
      'correlation_id:header:correlation-id',
      'causation_id:header:causation-id',
      'saga_id:header:saga-id',
      'traceparent:header:traceparent',
      'actor_id:header:actor-id',
      'actor_type:header:actor-type',
    ]);
  });

  it('drops the headers Debezium adds on its own', () => {
    expect(orderConfig).toMatchObject({
      'extended.headers.enabled': 'false',
      transforms: 'outbox,dropEventIdHeader',
      'transforms.dropEventIdHeader.type': 'org.apache.kafka.connect.transforms.DropHeaders',
      'transforms.dropEventIdHeader.headers': 'id',
    });
  });
});
