export interface OutboxConnectorTarget {
  readonly databaseHost: string;
  readonly databaseName: string;
  readonly databaseUser: string;
  readonly passwordVariable: string;
  readonly slotName: string;
  readonly topicPrefix: string;
}

export type ConnectorConfig = Readonly<Record<string, string>>;

const outboxHeaderPlacement = [
  'id:header:message-id',
  'message_type:header:message-type',
  'correlation_id:header:correlation-id',
  'causation_id:header:causation-id',
  'saga_id:header:saga-id',
  'traceparent:header:traceparent',
  'actor_id:header:actor-id',
  'actor_type:header:actor-type',
].join(',');

const outboxRelaySettings: ConnectorConfig = {
  'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
  'tasks.max': '1',
  'database.port': '5432',
  'plugin.name': 'pgoutput',
  'publication.name': 'outbox_publication',
  'publication.autocreate.mode': 'disabled',
  'table.include.list': 'public.outbox',
  'snapshot.mode': 'no_data',
  'tombstones.on.delete': 'false',
  'extended.headers.enabled': 'false',
  'key.converter': 'org.apache.kafka.connect.storage.StringConverter',
  'value.converter': 'org.apache.kafka.connect.converters.ByteArrayConverter',
  transforms: 'outbox,dropEventIdHeader',
  'transforms.outbox.type': 'io.debezium.transforms.outbox.EventRouter',
  'transforms.outbox.route.by.field': 'topic',
  'transforms.outbox.route.topic.replacement': '${routedByValue}',
  'transforms.outbox.table.field.event.id': 'id',
  'transforms.outbox.table.field.event.key': 'aggregate_id',
  'transforms.outbox.table.field.event.payload': 'payload',
  'transforms.outbox.table.fields.additional.placement': outboxHeaderPlacement,
  'transforms.dropEventIdHeader.type': 'org.apache.kafka.connect.transforms.DropHeaders',
  'transforms.dropEventIdHeader.headers': 'id',
};

export function outboxConnectorConfig(target: OutboxConnectorTarget): ConnectorConfig {
  return {
    ...outboxRelaySettings,
    'database.hostname': target.databaseHost,
    'database.dbname': target.databaseName,
    'database.user': target.databaseUser,
    'database.password': `\${env:${target.passwordVariable}}`,
    'slot.name': target.slotName,
    'topic.prefix': target.topicPrefix,
  };
}
