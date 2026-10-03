import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { KafkaConnectClient } from './kafka-connect-client.ts';

let kafkaConnectDouble: Server | undefined;
let restartRequests: string[];
let statusReadCount: number;

async function serveStatuses(statuses: readonly object[]): Promise<KafkaConnectClient> {
  const remaining = [...statuses];
  restartRequests = [];
  statusReadCount = 0;
  kafkaConnectDouble = createServer((request, response) => {
    if (request.method === 'POST') {
      restartRequests.push(request.url ?? '');
      response.writeHead(202, { 'content-type': 'application/json' }).end('{}');
      return;
    }
    statusReadCount += 1;
    const status = remaining.length > 1 ? remaining.shift() : remaining[0];
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(status));
  });
  await new Promise<void>((resolve) => {
    kafkaConnectDouble?.listen(0, '127.0.0.1', resolve);
  });
  const address = kafkaConnectDouble.address();
  if (address === null || typeof address === 'string') throw new Error('double not listening');
  return new KafkaConnectClient(`http://127.0.0.1:${String(address.port)}`);
}

afterEach(async () => {
  await new Promise((resolve) => kafkaConnectDouble?.close(resolve));
});

const failedTask = {
  connector: { state: 'RUNNING' },
  tasks: [
    {
      id: 0,
      state: 'FAILED',
      trace:
        'org.apache.kafka.connect.errors.ConnectException: Publication autocreation is disabled, please create one and restart the connector.',
    },
  ],
};

const runningTask = { connector: { state: 'RUNNING' }, tasks: [{ id: 0, state: 'RUNNING' }] };

describe('KafkaConnectClient.waitForConnectorRunning', () => {
  it('fails after one poll with the task trace when a task keeps failing', async () => {
    const kafkaConnect = await serveStatuses([failedTask]);

    await expect(kafkaConnect.waitForConnectorRunning('order-outbox')).rejects.toThrow(
      'Publication autocreation is disabled',
    );
  });

  it('tolerates the failed state a restart leaves behind for one poll', async () => {
    const kafkaConnect = await serveStatuses([failedTask, runningTask]);

    await expect(kafkaConnect.waitForConnectorRunning('order-outbox')).resolves.toBeUndefined();
  });

  it('waits until the connector and every task run', async () => {
    const kafkaConnect = await serveStatuses([
      { connector: { state: 'RUNNING' }, tasks: [] },
      runningTask,
    ]);

    await expect(kafkaConnect.waitForConnectorRunning('order-outbox')).resolves.toBeUndefined();
    expect(statusReadCount).toBe(2);
  });

  it('fails only on consecutive failed reads', async () => {
    const restartingTask = {
      connector: { state: 'RUNNING' },
      tasks: [{ id: 0, state: 'RESTARTING' }],
    };
    const kafkaConnect = await serveStatuses([failedTask, restartingTask, failedTask, runningTask]);

    await expect(kafkaConnect.waitForConnectorRunning('order-outbox')).resolves.toBeUndefined();
  });

  it('fails with the trace of a failed connector', async () => {
    const failedConnector = { connector: { state: 'FAILED', trace: 'connector boom' }, tasks: [] };
    const kafkaConnect = await serveStatuses([failedConnector]);

    await expect(kafkaConnect.waitForConnectorRunning('order-outbox')).rejects.toThrow(
      'connector boom',
    );
  });
});

describe('KafkaConnectClient.restartFailedTasks', () => {
  it('restarts the failed tasks of a connector', async () => {
    const kafkaConnect = await serveStatuses([failedTask]);

    await kafkaConnect.restartFailedTasks('order-outbox');

    expect(restartRequests).toEqual([
      '/connectors/order-outbox/restart?includeTasks=true&onlyFailed=true',
    ]);
  });

  it('leaves a running connector alone', async () => {
    const kafkaConnect = await serveStatuses([runningTask]);

    await kafkaConnect.restartFailedTasks('order-outbox');

    expect(restartRequests).toEqual([]);
  });
});
