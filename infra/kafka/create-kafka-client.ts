import { KafkaJS } from '@confluentinc/kafka-javascript';

const hostBootstrapServers = 'localhost:9092,localhost:9093,localhost:9094';

export function createKafkaClient(): KafkaJS.Kafka {
  const bootstrapServers = process.env['KAFKA_BOOTSTRAP_SERVERS'] ?? hostBootstrapServers;
  return new KafkaJS.Kafka({
    'broker.address.family': 'v4',
    kafkaJS: { brokers: bootstrapServers.split(','), logLevel: KafkaJS.logLevel.ERROR },
  });
}
