import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';
import type { paths } from '../generated/consumer-api.ts';
import {
  sendConsumerRegistration,
  sendOrderPlacement,
  type ConsumerApi,
  type OrderPlacement,
} from './consumer-api.adapter.ts';

interface Answer {
  readonly status: number;
  readonly body: object;
}

const placement: OrderPlacement = {
  restaurantId: '0199a5d0-0000-7000-8000-00000000c001',
  lineItems: [{ menuItemId: '0199a5d0-0000-7000-8000-000000000101', quantity: 2 }],
  deliveryAddress: {
    street: 'Rua Augusta',
    number: '1500',
    city: 'Sao Paulo',
    postalCode: '01304-001',
  },
  paymentToken: 'tok_visa_0001',
  idempotencyKey: '0199a5d0-0000-7000-8000-0000000000f1',
};

const registration = {
  name: 'Ana Souza',
  email: 'ana.souza@food-delivery.test',
  addresses: [
    { street: 'Rua Augusta', number: '1500', city: 'Sao Paulo', postalCode: '01304-001' },
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
    body: { type: 'about:blank', title, status, ...(reason === undefined ? {} : { reason }) },
  };
}

describe('sendOrderPlacement', () => {
  it('sends the idempotency key as the Idempotency-Key header and the order without it', async () => {
    const edge = new FakeEdge({
      status: 201,
      body: { orderId: '0199a5d0-0000-7000-8000-0000000000a7' },
    });

    const result = await sendOrderPlacement(edge.api(), placement);

    const [request] = edge.requests;
    expect(result).toEqual({ orderId: '0199a5d0-0000-7000-8000-0000000000a7' });
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('http://edge.test/v1/orders');
    expect(request?.headers.get('idempotency-key')).toBe('0199a5d0-0000-7000-8000-0000000000f1');
    expect(await request?.json()).toEqual({
      restaurantId: placement.restaurantId,
      lineItems: placement.lineItems,
      deliveryAddress: placement.deliveryAddress,
      paymentToken: 'tok_visa_0001',
    });
  });

  it('describes a refusal by its reason', async () => {
    const edge = new FakeEdge(problem(422, 'Unprocessable Entity', 'MinimumOrderNotReached'));

    await expect(sendOrderPlacement(edge.api(), placement)).resolves.toEqual({
      problem: 'The order is below the minimum of the restaurant.',
    });
  });

  it('asks for a new sign-in when the edge refuses the access token', async () => {
    const edge = new FakeEdge(problem(401, 'Unauthorized'));

    await expect(sendOrderPlacement(edge.api(), placement)).resolves.toEqual({
      isSignInRequired: true,
    });
  });

  it('describes an unavailable service without a reason', async () => {
    const edge = new FakeEdge(problem(503, 'Service Unavailable'));

    await expect(sendOrderPlacement(edge.api(), placement)).resolves.toEqual({
      problem: 'The service is busy. Try again in a moment.',
    });
  });
});

describe('sendConsumerRegistration', () => {
  it('registers the consumer and answers its id', async () => {
    const edge = new FakeEdge({
      status: 201,
      body: { consumerId: '0199a5d0-0000-7000-8000-0000000000c9' },
    });

    const result = await sendConsumerRegistration(edge.api(), registration);

    expect(result).toEqual({ consumerId: '0199a5d0-0000-7000-8000-0000000000c9' });
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
