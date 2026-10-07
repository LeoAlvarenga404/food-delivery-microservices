import { recordActiveSpanFailure, runInRootSpan, type Logger } from '@fd/chassis-observability';

export interface PeriodicJobSettings {
  readonly name: string;
  readonly intervalInMilliseconds: number;
  readonly run: () => Promise<void>;
  readonly logger: Logger;
}

export interface RunningPeriodicJob {
  readonly stop: () => Promise<void>;
}

interface PeriodicJobState {
  readonly settings: PeriodicJobSettings;
  isStopRequested: boolean;
  nextRunTimer: NodeJS.Timeout | undefined;
  currentRun: Promise<void>;
}

async function runOnce(state: PeriodicJobState): Promise<void> {
  const { run, name, logger } = state.settings;
  try {
    await run();
  } catch (error) {
    recordActiveSpanFailure(error);
    logger.error({ err: error, jobName: name }, 'periodic job failed');
  }
}

function scheduleNextRun(state: PeriodicJobState): void {
  state.nextRunTimer = setTimeout(() => {
    state.currentRun = runInRootSpan(state.settings.name, () => runOnce(state)).then(() => {
      if (!state.isStopRequested) scheduleNextRun(state);
    });
  }, state.settings.intervalInMilliseconds);
}

async function stopJob(state: PeriodicJobState): Promise<void> {
  state.isStopRequested = true;
  clearTimeout(state.nextRunTimer);
  await state.currentRun;
}

export function startPeriodicJob(settings: PeriodicJobSettings): RunningPeriodicJob {
  const state: PeriodicJobState = {
    settings,
    isStopRequested: false,
    nextRunTimer: undefined,
    currentRun: Promise.resolve(),
  };
  scheduleNextRun(state);
  return { stop: () => stopJob(state) };
}
