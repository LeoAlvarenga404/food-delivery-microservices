import type { OutboxMessage } from '@fd/chassis-outbox';
import type { CommandSender } from '#application/ports/command-sender.port.ts';
import type { ParticipantCommand } from '#application/sagas/place-order/place-order.saga-state.ts';
import { toParticipantCommandMessage } from './participant-command.message-mapper.ts';

export class OutboxCommandSender implements CommandSender {
  readonly #enqueue: (message: OutboxMessage) => void;

  constructor(enqueue: (message: OutboxMessage) => void) {
    this.#enqueue = enqueue;
  }

  send(command: ParticipantCommand, sagaId: string): void {
    this.#enqueue(toParticipantCommandMessage(command, sagaId));
  }
}
