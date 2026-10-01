import { GenericContainer, Wait } from 'testcontainers';
import { findFreePort } from './free-port.ts';

export interface StartedKafka {
  readonly bootstrapServer: string;
  readonly stop: () => Promise<void>;
}

const kafkaImage = 'apache/kafka:4.3.1';

function singleNodeEnvironment(externalPort: number): Record<string, string> {
  return {
    KAFKA_NODE_ID: '1',
    KAFKA_PROCESS_ROLES: 'broker,controller',
    KAFKA_CONTROLLER_QUORUM_VOTERS: '1@localhost:29093',
    KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
    KAFKA_INTER_BROKER_LISTENER_NAME: 'INTERNAL',
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
      'CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT',
    KAFKA_LISTENERS: `CONTROLLER://:29093,INTERNAL://:29092,EXTERNAL://:${String(externalPort)}`,
    KAFKA_ADVERTISED_LISTENERS: `INTERNAL://localhost:29092,EXTERNAL://127.0.0.1:${String(externalPort)}`,
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false',
    KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
  };
}

export async function startKafkaContainer(): Promise<StartedKafka> {
  const externalPort = await findFreePort();
  const container = await new GenericContainer(kafkaImage)
    .withExposedPorts({ container: externalPort, host: externalPort })
    .withEnvironment(singleNodeEnvironment(externalPort))
    .withWaitStrategy(Wait.forLogMessage(/Kafka Server started/))
    .start();
  return {
    bootstrapServer: `127.0.0.1:${String(externalPort)}`,
    stop: async () => {
      await container.stop();
    },
  };
}
