import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Client,
  type HandlerContext,
  type ServiceImpl,
} from '@connectrpc/connect';
import {
  ConsumerService,
  type GetConsumerResponse,
  type RegisterConsumerRequest,
} from '@fd/contracts/fooddelivery/consumer/v1/service_pb.js';

export const registeredConsumerId = '0199a5d0-0000-7000-8000-0000000000c1';

export class FakeConsumerService {
  readonly registerConsumerRequests: RegisterConsumerRequest[] = [];
  readonly receivedCorrelationIds: string[] = [];
  readonly receivedAuthorizations: (string | null)[] = [];
  profile: GetConsumerResponse | undefined = undefined;
  failure: ConnectError | undefined = undefined;

  implementation(): ServiceImpl<typeof ConsumerService> {
    return {
      registerConsumer: (request, context) => {
        this.#receive(context);
        this.registerConsumerRequests.push(request);
        return { consumerId: registeredConsumerId };
      },
      getConsumer: (request, context) => {
        this.#receive(context);
        if (this.profile === undefined) throw new ConnectError('not registered', Code.NotFound);
        return this.profile;
      },
    };
  }

  client(): Client<typeof ConsumerService> {
    return createClient(
      ConsumerService,
      createRouterTransport(({ service }) => {
        service(ConsumerService, this.implementation());
      }),
    );
  }

  #receive(context: HandlerContext): void {
    this.receivedCorrelationIds.push(context.requestHeader.get('x-correlation-id') ?? '');
    this.receivedAuthorizations.push(context.requestHeader.get('authorization'));
    if (this.failure !== undefined) throw this.failure;
  }
}
