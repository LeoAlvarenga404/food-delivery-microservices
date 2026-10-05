import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';
import type { paths } from '../generated/consumer-api.ts';
import { sendConsumerRegistration, type ConsumerApi } from './consumer-api.adapter.ts';

interface Answer {
  readonly status: number;
  readonly body: object;
}

const registration = {
  name: 'Ana Souza',
  email: 'ana.souza@food-delivery.test',
  addresses: [
    {
      street: 'Rua Augusta',
      number: '1500',
      city: 'Sao Paulo',
      postalCode: '01304-001',
    },
  ],
};

class FakeEdge {
  readonly requests: Request[] = [];
  readonly #answer: Answer;

  constructor(answer: Answer) {
    this.#answer = answer;
  }

  api(): ConsumerApi {
    return createClient<paths>({
      baseUrl: 'http://edge.test',
      fetch: (request) => {
        this.requests.push(request);
        const isProblem = this.#answer.status >= 400;
        return Promise.resolve(
          new Response(JSON.stringify(this.#answer.body), {
            status: this.#answer.status,
            headers: {
              'content-type': isProblem ? 'application/problem+json' : 'application/json',
            },
          }),
        );
      },
    });
  }
}

function problem(status: number, title: string, reason?: string): Answer {
  return {
    status,
    body: {
      type: 'about:blank',
      title,
      status,
      ...(reason === undefined ? {} : { reason }),
    },
  };
}

describe('sendConsumerRegistration', () => {
  it('registers the consumer and answers its id', async () => {
    const edge = new FakeEdge({
      status: 201,
      body: { consumerId: '0199a5d0-0000-7000-8000-0000000000c9' },
    });

    const result = await sendConsumerRegistration(edge.api(), registration);

    expect(result).toEqual({
      consumerId: '0199a5d0-0000-7000-8000-0000000000c9',
    });
    expect(edge.requests[0]?.url).toBe('http://edge.test/v1/consumers/me');
    expect(await edge.requests[0]?.json()).toEqual(registration);
  });

  it('describes a second registration by its reason', async () => {
    const edge = new FakeEdge(problem(409, 'Conflict', 'ConsumerAlreadyRegistered'));

    await expect(sendConsumerRegistration(edge.api(), registration)).resolves.toEqual({
      problem: 'You are already registered.',
    });
  });
});
