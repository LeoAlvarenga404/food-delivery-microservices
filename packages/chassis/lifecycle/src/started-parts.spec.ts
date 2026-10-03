import { describe, expect, it } from 'vitest';
import { StartedParts } from './started-parts.ts';

function recordingStop(stopped: string[], name: string): () => Promise<void> {
  return () => {
    stopped.push(name);
    return Promise.resolve();
  };
}

describe('StartedParts', () => {
  it('stops the parts in the reverse order of their start', async () => {
    const stopped: string[] = [];
    const started = new StartedParts();
    started.add(recordingStop(stopped, 'database'));
    started.add(recordingStop(stopped, 'consumer'));
    started.add(recordingStop(stopped, 'http'));

    await started.stopAll();

    expect(stopped).toEqual(['http', 'consumer', 'database']);
  });

  it('waits for a later part to finish stopping before it stops the earlier part', async () => {
    const stopped: string[] = [];
    const httpStop = Promise.withResolvers<undefined>();
    const started = new StartedParts();
    started.add(recordingStop(stopped, 'database'));
    started.add(() => httpStop.promise);

    const stopping = started.stopAll();
    await Promise.resolve();
    expect(stopped).toEqual([]);
    httpStop.resolve(undefined);
    await stopping;

    expect(stopped).toEqual(['database']);
  });

  it('stops the earlier parts even when a later part fails to stop', async () => {
    const stopped: string[] = [];
    const failure = new Error('consumer did not stop');
    const started = new StartedParts();
    started.add(recordingStop(stopped, 'database'));
    started.add(() => Promise.reject(failure));

    await expect(started.stopAll()).rejects.toBe(failure);
    expect(stopped).toEqual(['database']);
  });
});
