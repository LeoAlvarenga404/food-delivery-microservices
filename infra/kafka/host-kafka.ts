import { KafkaJS } from '@confluentinc/kafka-javascript';

const hostBootstrapServers = ['localhost:9092', 'localhost:9093', 'localhost:9094'];

export function createHostKafka(): KafkaJS.Kafka {
  return new KafkaJS.Kafka({
    kafkaJS: { brokers: hostBootstrapServers, logLevel: KafkaJS.logLevel.ERROR },
  });
}
