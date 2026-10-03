import { describe, expect, it } from 'vitest';
import { stopInOrder } from './stop-in-order.adapter.ts';

describe('stopInOrder', () => {
  it('runs every stopper in order when all succeed', async () => {
    const stopped: string[] = [];

    await stopInOrder([
      () => {
        stopped.push('http');
        return Promise.resolve();
      },
      () => {
        stopped.push('database');
        return Promise.resolve();
      },
    ]);

    expect(stopped).toEqual(['http', 'database']);
  });

  it('keeps stopping the later parts when one part fails and rethrows the failure', async () => {
    const stopped: string[] = [];
    const failure = new Error('consumer did not stop');

    const outcome = stopInOrder([
      () => {
        stopped.push('http');
        return Promise.resolve();
      },
      () => Promise.reject(failure),
      () => {
        stopped.push('database');
        return Promise.resolve();
      },
    ]);

    await expect(outcome).rejects.toBe(failure);
    expect(stopped).toEqual(['http', 'database']);
  });

  it('rethrows every failure together when several parts fail', async () => {
    const outcome = stopInOrder([
      () => Promise.reject(new Error('first')),
      () => Promise.reject(new Error('second')),
    ]);

    await expect(outcome).rejects.toMatchObject({
      errors: [{ message: 'first' }, { message: 'second' }],
    });
  });
});
