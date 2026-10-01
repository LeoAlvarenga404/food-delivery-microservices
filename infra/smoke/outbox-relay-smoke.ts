import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { KafkaJS } from '@confluentinc/kafka-javascript';
import {
  putConnectorConfiguration,
  removeConnector,
  waitForConnectorRunning,
} from '../debezium/kafka-connect-client.ts';
import { outboxConnectorConfiguration } from '../debezium/outbox-connector-configuration.ts';
import { createHostKafka } from '../kafka/create-host-kafka.ts';
import { runOrderDatabaseSql } from './order-database.ts';
import { receiveSmokeMessage } from './receive-smoke-message.ts';

interface SmokeRow {
  readonly messageId: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly sagaId: string;
}

const smokeDatabase = 'outbox_smoke';
const smokeConnector = 'outbox-smoke';
const smokeTopic = 'smoke.outbox.events';
const payloadHex = '0a0300ff7f80';
const messageType = 'fooddelivery.smoke.v1.SmokeHappened';
const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

function newSmokeRow(): SmokeRow {
  return {
    messageId: randomUUID(),
    aggregateId: `smoke-${randomUUID()}`,
    correlationId: randomUUID(),
    sagaId: randomUUID(),
  };
}

function dropSmokeDatabase(): void {
  runOrderDatabaseSql(
    'order_service',
    [
      'set client_min_messages = warning;',
      `select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name = '${smokeDatabase}';`,
      `drop database if exists ${smokeDatabase} with (force);`,
    ].join('\n'),
  );
}

function createSmokeDatabase(): void {
  runOrderDatabaseSql('order_service', `create database ${smokeDatabase};`);
  runOrderDatabaseSql(
    smokeDatabase,
    readFileSync(new URL('outbox-smoke.sql', import.meta.url), 'utf8'),
  );
}

function insertSmokeRow(row: SmokeRow): void {
  runOrderDatabaseSql(
    smokeDatabase,
    `insert into outbox (id, topic, aggregate_type, aggregate_id, message_type, payload, correlation_id,
       causation_id, saga_id, traceparent, actor_id, actor_type, occurred_at)
     values ('${row.messageId}', '${smokeTopic}', 'SmokeAggregate', '${row.aggregateId}',
       '${messageType}', '\\x${payloadHex}', '${row.correlationId}', null, '${row.sagaId}',
       '${traceparent}', 'smoke-actor', 'system', now());`,
  );
}

async function ensureSmokeTopic(admin: KafkaJS.Admin): Promise<void> {
  const existingTopicNames = await admin.listTopics();
  if (existingTopicNames.includes(smokeTopic)) return;
  await admin.createTopics({
    topics: [{ topic: smokeTopic, numPartitions: 1, replicationFactor: 3 }],
  });
}

async function registerSmokeConnector(): Promise<void> {
  await putConnectorConfiguration(
    smokeConnector,
    outboxConnectorConfiguration({
      databaseHost: 'order-db',
      databaseName: smokeDatabase,
      databaseUser: 'order_service',
      passwordEnvironmentVariable: 'ORDER_DB_PASSWORD',
      slotName: smokeDatabase,
      topicPrefix: smokeConnector,
    }),
  );
  await waitForConnectorRunning(smokeConnector);
}

async function expectRelayed(kafka: KafkaJS.Kafka, row: SmokeRow): Promise<void> {
  const received = await receiveSmokeMessage(kafka, smokeTopic, row.messageId);
  assert.equal(received.key, row.aggregateId);
  assert.equal(received.payloadHex, payloadHex);
  assert.deepEqual(received.headers, {
    'message-id': row.messageId,
    'message-type': messageType,
    'correlation-id': row.correlationId,
    'causation-id': '',
    'saga-id': row.sagaId,
    traceparent,
    'actor-id': 'smoke-actor',
    'actor-type': 'system',
  });
}

async function relaySmokeRows(kafka: KafkaJS.Kafka, admin: KafkaJS.Admin): Promise<void> {
  const rowWrittenBeforeRegistration = newSmokeRow();
  const rowWrittenAfterRegistration = newSmokeRow();
  createSmokeDatabase();
  await ensureSmokeTopic(admin);
  insertSmokeRow(rowWrittenBeforeRegistration);
  await registerSmokeConnector();
  insertSmokeRow(rowWrittenAfterRegistration);
  await expectRelayed(kafka, rowWrittenBeforeRegistration);
  await expectRelayed(kafka, rowWrittenAfterRegistration);
}

async function cleanUp(admin: KafkaJS.Admin): Promise<void> {
  await removeConnector(smokeConnector);
  dropSmokeDatabase();
  const existingTopicNames = await admin.listTopics();
  if (existingTopicNames.includes(smokeTopic)) await admin.deleteTopics({ topics: [smokeTopic] });
}

const kafka = createHostKafka();
const admin = kafka.admin();
await admin.connect();

try {
  await cleanUp(admin);
  await relaySmokeRows(kafka, admin);
  console.log(
    'outbox relay smoke passed: rows written before and after registration arrived with key, raw payload bytes and headers',
  );
} finally {
  await cleanUp(admin);
  await admin.disconnect();
}
