import { left, right, type Either } from '@fd/domain';
import { parseAddress, type Address, type InvalidAddress } from './address.value-object.ts';
import type { ConsumerId } from './consumer-id.value-object.ts';
import {
  parseConsumerName,
  type ConsumerName,
  type InvalidConsumerName,
} from './consumer-name.value-object.ts';
import { parseEmail, type Email, type InvalidEmail } from './email.value-object.ts';

export type ConsumerStatus = 'ACTIVE' | 'BLOCKED';

export interface ConsumerSnapshot {
  readonly consumerId: ConsumerId;
  readonly name: ConsumerName;
  readonly email: Email;
  readonly addresses: readonly Address[];
  readonly status: ConsumerStatus;
  readonly version: number;
}

export interface RegisterConsumerInput {
  readonly consumerId: ConsumerId;
  readonly name: string;
  readonly email: string;
  readonly addresses: readonly Address[];
}

export interface ConsumerBlocked {
  readonly type: 'ConsumerBlocked';
  readonly consumerId: ConsumerId;
}

export interface InvalidAddressCount {
  readonly type: 'InvalidAddressCount';
  readonly addressCount: number;
}

export type ConsumerRegistrationError =
  InvalidConsumerName | InvalidEmail | InvalidAddress | InvalidAddressCount;

const maximumAddressCount = 5;

function parseAddresses(
  rawAddresses: readonly Address[],
): Either<InvalidAddress | InvalidAddressCount, readonly Address[]> {
  if (rawAddresses.length === 0 || rawAddresses.length > maximumAddressCount) {
    return left({ type: 'InvalidAddressCount', addressCount: rawAddresses.length });
  }
  const addresses: Address[] = [];
  for (const rawAddress of rawAddresses) {
    const address = parseAddress(rawAddress);
    if (address.isLeft()) return address;
    addresses.push(address.success);
  }
  return right(addresses);
}

export class Consumer {
  readonly #consumerId: ConsumerId;
  readonly #name: ConsumerName;
  readonly #email: Email;
  readonly #addresses: readonly Address[];
  readonly #status: ConsumerStatus;
  readonly #version: number;

  private constructor(snapshot: ConsumerSnapshot) {
    this.#consumerId = snapshot.consumerId;
    this.#name = snapshot.name;
    this.#email = snapshot.email;
    this.#addresses = snapshot.addresses;
    this.#status = snapshot.status;
    this.#version = snapshot.version;
  }

  static register(input: RegisterConsumerInput): Either<ConsumerRegistrationError, Consumer> {
    const name = parseConsumerName(input.name);
    if (name.isLeft()) return name;
    const email = parseEmail(input.email);
    if (email.isLeft()) return email;
    const addresses = parseAddresses(input.addresses);
    if (addresses.isLeft()) return addresses;
    return right(
      new Consumer({
        consumerId: input.consumerId,
        name: name.success,
        email: email.success,
        addresses: addresses.success,
        status: 'ACTIVE',
        version: 0,
      }),
    );
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
    return {
      consumerId: this.#consumerId,
      name: this.#name,
      email: this.#email,
      addresses: this.#addresses,
      status: this.#status,
      version: this.#version,
    };
  }
}
