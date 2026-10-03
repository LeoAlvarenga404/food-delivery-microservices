import { KafkaJS } from '@confluentinc/kafka-javascript';

const hostBootstrapServers = 'localhost:9092,localhost:9093,localhost:9094';

function parseServers(servers: string): string[] {
  return servers
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server !== '');
}

export function createKafkaClient(): KafkaJS.Kafka {
  const configuredServers = parseServers(process.env['KAFKA_BOOTSTRAP_SERVERS'] ?? '');
  const brokers =
    configuredServers.length > 0 ? configuredServers : parseServers(hostBootstrapServers);
  return new KafkaJS.Kafka({
    'broker.address.family': 'v4',
    kafkaJS: { brokers, logLevel: KafkaJS.logLevel.ERROR },
  });
}
