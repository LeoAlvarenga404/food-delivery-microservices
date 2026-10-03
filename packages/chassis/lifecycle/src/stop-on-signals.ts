import type { Logger } from '@fd/chassis-observability';

export interface StoppableService {
  readonly stop: () => Promise<void>;
}

export function stopOnSignals(service: StoppableService, logger: Logger): void {
  const stop = (): void => {
    service.stop().catch((error: unknown) => {
      logger.error({ err: error }, 'stopping after a signal failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
