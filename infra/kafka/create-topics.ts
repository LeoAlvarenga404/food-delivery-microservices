import type { KafkaJS } from '@confluentinc/kafka-javascript';
import { createKafkaClient } from './create-kafka-client.ts';
import { topicCatalogue, type TopicDefinition } from './topic-catalogue.ts';

const partitionCount = 6;
const replicationFactor = 3;

function toTopicConfiguration(topic: TopicDefinition): KafkaJS.ITopicConfig {
  return {
    topic: topic.name,
    numPartitions: partitionCount,
    replicationFactor,
    configEntries: [{ name: 'retention.ms', value: String(topic.retentionInMilliseconds) }],
  };
}

const admin = createKafkaClient().admin();
await admin.connect();

try {
  const existingTopicNames = new Set(await admin.listTopics());
  const missingTopics = topicCatalogue.filter((topic) => !existingTopicNames.has(topic.name));
  if (missingTopics.length > 0)
    await admin.createTopics({ topics: missingTopics.map(toTopicConfiguration) });
  for (const topic of topicCatalogue) {
    const outcome = missingTopics.includes(topic) ? 'created' : 'already exists';
    console.log(`${topic.name}: ${outcome}`);
  }
} finally {
  await admin.disconnect();
}
