import type { ParticipantCommand } from '#application/sagas/place-order/place-order.saga.ts';

export interface CommandSender {
  send(command: ParticipantCommand, sagaId: string): void;
}
