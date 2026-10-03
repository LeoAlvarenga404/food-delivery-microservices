import { left, right, type Either } from '@fd/domain';
import type { ConsumerId } from './consumer-id.value-object.ts';

export type ConsumerStatus = 'ACTIVE' | 'BLOCKED';

export interface ConsumerSnapshot {
  readonly consumerId: ConsumerId;
  readonly status: ConsumerStatus;
  readonly version: number;
}

export interface ConsumerBlocked {
  readonly type: 'ConsumerBlocked';
  readonly consumerId: ConsumerId;
}

export class Consumer {
  readonly #consumerId: ConsumerId;
  readonly #status: ConsumerStatus;
  readonly #version: number;

  private constructor(snapshot: ConsumerSnapshot) {
    this.#consumerId = snapshot.consumerId;
    this.#status = snapshot.status;
    this.#version = snapshot.version;
  }

  static restore(snapshot: ConsumerSnapshot): Consumer {
    return new Consumer(snapshot);
  }

  verifyMayOrder(): Either<ConsumerBlocked, undefined> {
    if (this.#status === 'BLOCKED') {
      return left({ type: 'ConsumerBlocked', consumerId: this.#consumerId });
    }
    return right(undefined);
  }

  toSnapshot(): ConsumerSnapshot {
    return { consumerId: this.#consumerId, status: this.#status, version: this.#version };
  }
}
