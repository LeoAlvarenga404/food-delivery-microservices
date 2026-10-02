import type { CommandSender } from '#application/ports/command-sender.port.ts';
import type { ParticipantCommand } from '#application/sagas/place-order/place-order.saga.ts';

export interface SentCommand {
  readonly command: ParticipantCommand;
  readonly sagaId: string;
}

export class FakeCommandSender implements CommandSender {
  readonly sentCommands: SentCommand[] = [];

  send(command: ParticipantCommand, sagaId: string): void {
    this.sentCommands.push({ command, sagaId });
  }
}
