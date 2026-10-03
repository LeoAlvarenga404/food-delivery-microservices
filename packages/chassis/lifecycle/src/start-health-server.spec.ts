import { afterEach, describe, expect, it } from 'vitest';
import { startHealthServer, type RunningHealthServer } from './start-health-server.ts';

const runningServers: RunningHealthServer[] = [];

async function startOnFreePort(): Promise<RunningHealthServer> {
  const healthServer = await startHealthServer({ host: '127.0.0.1', port: 0 });
  runningServers.push(healthServer);
  return healthServer;
}

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((healthServer) => healthServer.stop()));
});

describe('startHealthServer', () => {
  it('answers its health endpoint at the url it listens on', async () => {
    const healthServer = await startOnFreePort();

    const response = await fetch(`${healthServer.url}/health`);

    expect(new URL(healthServer.url).hostname).toBe('127.0.0.1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('refuses to start on a port that is already taken', async () => {
    const healthServer = await startOnFreePort();
    const takenPort = Number(new URL(healthServer.url).port);

    await expect(startHealthServer({ host: '127.0.0.1', port: takenPort })).rejects.toThrow(
      'EADDRINUSE',
    );
  });

  it('stops listening when stopped', async () => {
    const healthServer = await startHealthServer({ host: '127.0.0.1', port: 0 });

    await healthServer.stop();

    await expect(fetch(`${healthServer.url}/health`)).rejects.toThrow('fetch failed');
  });
});
