import type { KafkaJS } from '@confluentinc/kafka-javascript';

export type TopicDefinition =
  | {
      readonly name: string;
      readonly cleanupPolicy: 'delete';
      readonly retentionInMilliseconds: number;
    }
  | {
      readonly name: string;
      readonly cleanupPolicy: 'compact';
    };

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const messageRetentionInMilliseconds = 7 * dayInMilliseconds;
const deadLetterRetentionInMilliseconds = 30 * dayInMilliseconds;

function messageTopic(name: string): TopicDefinition {
  return { name, cleanupPolicy: 'delete', retentionInMilliseconds: messageRetentionInMilliseconds };
}

function stateTopic(name: string): TopicDefinition {
  return { name, cleanupPolicy: 'compact' };
}

function deadLetterTopic(sourceTopic: string, consumerGroup: string): TopicDefinition {
  return {
    name: `${sourceTopic}.${consumerGroup}.dlq`,
    cleanupPolicy: 'delete',
    retentionInMilliseconds: deadLetterRetentionInMilliseconds,
  };
}

export const topicCatalogue: readonly TopicDefinition[] = [
  messageTopic('order.order.events'),
  messageTopic('kitchen.ticket.events'),
  messageTopic('consumer.commands'),
  messageTopic('kitchen.commands'),
  messageTopic('accounting.commands'),
  messageTopic('order.place-order-saga.replies'),
  stateTopic('restaurant.restaurant.state'),
  deadLetterTopic('consumer.commands', 'consumer-service'),
  deadLetterTopic('kitchen.commands', 'kitchen-service'),
  deadLetterTopic('accounting.commands', 'accounting-service'),
  deadLetterTopic('order.place-order-saga.replies', 'order-service'),
  deadLetterTopic('restaurant.restaurant.state', 'order-service'),
  deadLetterTopic('restaurant.restaurant.state', 'restaurant-service'),
  deadLetterTopic('restaurant.restaurant.state', 'kitchen-service'),
];

export function toTopicConfigEntries(
  topic: TopicDefinition,
): readonly KafkaJS.IResourceConfigEntry[] {
  if (topic.cleanupPolicy === 'compact') return [{ name: 'cleanup.policy', value: 'compact' }];
  return [{ name: 'retention.ms', value: String(topic.retentionInMilliseconds) }];
}
