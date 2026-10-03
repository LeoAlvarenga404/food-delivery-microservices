import { KafkaJS } from '@confluentinc/kafka-javascript';

export interface KafkaSettings {
  readonly clientId: string;
  readonly bootstrapServers: readonly string[];
}

export function createKafka(settings: KafkaSettings): KafkaJS.Kafka {
  return new KafkaJS.Kafka({
    'broker.address.family': 'v4',
    kafkaJS: {
      clientId: settings.clientId,
      brokers: [...settings.bootstrapServers],
      logLevel: KafkaJS.logLevel.ERROR,
    },
  });
}
