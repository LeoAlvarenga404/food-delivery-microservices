import { describe, expect, it } from 'vitest';
import { topicCatalogue, toTopicConfigEntries } from './topic-catalogue.ts';

const sevenDaysInMilliseconds = 604_800_000;
const thirtyDaysInMilliseconds = 2_592_000_000;

const topicNamePatterns = [
  /^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*\.events$/,
  /^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*\.state$/,
  /^[a-z]+(?:-[a-z]+)*\.commands$/,
  /^order\.[a-z]+(?:-[a-z]+)*-saga\.replies$/,
  /^.+\.[a-z]+(?:-[a-z]+)*-service\.dlq$/,
];

const topicNames = topicCatalogue.map((topic) => topic.name);
const deadLetterTopics = topicCatalogue.filter((topic) => topic.name.endsWith('.dlq'));

describe('topicCatalogue', () => {
  it('lists the slice 1 topics, the restaurant state topic and its dead letters in Order and Restaurant', () => {
    expect(topicNames).toEqual([
      'order.order.events',
      'consumer.commands',
      'kitchen.commands',
      'accounting.commands',
      'order.place-order-saga.replies',
      'restaurant.restaurant.state',
      'consumer.commands.consumer-service.dlq',
      'kitchen.commands.kitchen-service.dlq',
      'accounting.commands.accounting-service.dlq',
      'order.place-order-saga.replies.order-service.dlq',
      'restaurant.restaurant.state.order-service.dlq',
      'restaurant.restaurant.state.restaurant-service.dlq',
    ]);
  });

  it.each(topicNames)('names %s with a pattern from the topic design', (topicName) => {
    expect(topicNamePatterns.some((pattern) => pattern.test(topicName))).toBe(true);
  });

  it.each(deadLetterTopics)('derives $name from a topic in the catalogue', (deadLetterTopic) => {
    const sourceTopic = deadLetterTopic.name.split('.').slice(0, -2).join('.');

    expect(topicNames).toContain(sourceTopic);
  });

  it('compacts state topics, keeps dead letters for thirty days and the others for seven', () => {
    const configEntriesByName = Object.fromEntries(
      topicCatalogue.map((topic) => [topic.name, toTopicConfigEntries(topic)]),
    );

    expect(configEntriesByName).toEqual(
      Object.fromEntries(
        topicNames.map((topicName) => [
          topicName,
          topicName.endsWith('.state')
            ? [{ name: 'cleanup.policy', value: 'compact' }]
            : [
                {
                  name: 'retention.ms',
                  value: String(
                    topicName.endsWith('.dlq') ? thirtyDaysInMilliseconds : sevenDaysInMilliseconds,
                  ),
                },
              ],
        ]),
      ),
    );
  });
});
