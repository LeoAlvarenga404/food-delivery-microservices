export interface TopicDefinition {
  readonly name: string;
  readonly retentionInMilliseconds: number;
}

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const messageRetentionInMilliseconds = 7 * dayInMilliseconds;
const deadLetterRetentionInMilliseconds = 30 * dayInMilliseconds;

function messageTopic(name: string): TopicDefinition {
  return { name, retentionInMilliseconds: messageRetentionInMilliseconds };
}

function deadLetterTopic(sourceTopic: string, consumerGroup: string): TopicDefinition {
  return {
    name: `${sourceTopic}.${consumerGroup}.dlq`,
    retentionInMilliseconds: deadLetterRetentionInMilliseconds,
  };
}

export const topicCatalogue: readonly TopicDefinition[] = [
  messageTopic('order.order.events'),
  messageTopic('consumer.commands'),
  messageTopic('kitchen.commands'),
  messageTopic('accounting.commands'),
  messageTopic('order.place-order-saga.replies'),
  deadLetterTopic('consumer.commands', 'consumer-service'),
  deadLetterTopic('kitchen.commands', 'kitchen-service'),
  deadLetterTopic('accounting.commands', 'accounting-service'),
  deadLetterTopic('order.place-order-saga.replies', 'order-service'),
];
