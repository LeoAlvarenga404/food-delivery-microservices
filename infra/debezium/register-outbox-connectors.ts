import { KafkaConnectClient } from './kafka-connect-client.ts';
import { outboxConnectorConfiguration } from './outbox-connector-configuration.ts';
import { outboxConnectors } from './outbox-connectors.ts';

const kafkaConnect = new KafkaConnectClient(
  process.env['KAFKA_CONNECT_URL'] ?? 'http://localhost:8083',
);

for (const connector of outboxConnectors) {
  await kafkaConnect.restartFailedTasks(connector.connectorName);
  await kafkaConnect.putConnectorConfiguration(
    connector.connectorName,
    outboxConnectorConfiguration(connector),
  );
  await kafkaConnect.waitForConnectorRunning(connector.connectorName);
  console.log(`${connector.connectorName}: running`);
}
