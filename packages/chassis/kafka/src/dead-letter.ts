import type { KafkaJS } from '@confluentinc/kafka-javascript';
import type { FailureClass } from './failure-handling.ts';

export interface DeadLetterCause {
  readonly failureClass: FailureClass;
  readonly error: unknown;
  readonly attemptCount: number;
}

export function deadLetterTopic(sourceTopic: string, consumerGroup: string): string {
  return `${sourceTopic}.${consumerGroup}.dlq`;
}

interface ErrorDescription {
  readonly type: string;
  readonly message: string;
  readonly stack: string;
}

function describeError(error: unknown): ErrorDescription {
  if (error instanceof Error) {
    return { type: error.name, message: error.message, stack: error.stack ?? '' };
  }
  return { type: typeof error, message: String(error), stack: '' };
}

export function deadLetterRecord(
  delivery: KafkaJS.EachMessagePayload,
  cause: DeadLetterCause,
): KafkaJS.Message {
  const { topic, partition, message } = delivery;
  const description = describeError(cause.error);
  return {
    key: message.key,
    value: message.value,
    headers: {
      ...message.headers,
      'error-class': cause.failureClass,
      'error-type': description.type,
      'error-message': description.message,
      'error-stack': description.stack,
      'original-topic': topic,
      'original-partition': String(partition),
      'original-offset': message.offset,
      'attempt-count': String(cause.attemptCount),
    },
  };
}
