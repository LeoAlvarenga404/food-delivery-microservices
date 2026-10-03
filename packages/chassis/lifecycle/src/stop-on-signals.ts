import type { Logger } from '@fd/chassis-observability';

export interface StoppableService {
  readonly stop: () => Promise<void>;
}

const stopSignals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export function stopOnSignals(service: StoppableService, logger: Logger): void {
  const stop = (): void => {
    for (const signal of stopSignals) process.off(signal, stop);
    service.stop().catch((error: unknown) => {
      logger.error({ err: error }, 'stopping after a signal failed');
      process.exitCode = 1;
    });
  };
  for (const signal of stopSignals) process.on(signal, stop);
}
