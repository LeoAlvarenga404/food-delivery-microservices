import { Code, ConnectError, createContextKey, type Interceptor } from '@connectrpc/connect';
import type { Logger } from '@fd/chassis-observability';
import { isUuid } from '@fd/domain';

export interface RpcCorrelationSettings {
  readonly logger: Logger;
  readonly generateCorrelationId: () => string;
}

export const correlationIdKey = createContextKey<string>('', {
  description: 'correlation id of the current rpc call',
});

const correlationIdHeader = 'x-correlation-id';

export function createRpcCorrelation(settings: RpcCorrelationSettings): Interceptor {
  return (next) => async (request) => {
    const incomingCorrelationId = request.header.get(correlationIdHeader);
    const correlationId =
      incomingCorrelationId !== null && isUuid(incomingCorrelationId)
        ? incomingCorrelationId.toLowerCase()
        : settings.generateCorrelationId();
    request.contextValues.set(correlationIdKey, correlationId);
    try {
      const response = await next(request);
      response.header.set(correlationIdHeader, correlationId);
      return response;
    } catch (error) {
      if (error instanceof ConnectError) {
        error.metadata.set(correlationIdHeader, correlationId);
        throw error;
      }
      const procedure = `${request.service.typeName}/${request.method.name}`;
      settings.logger.error({ err: error, procedure, correlationId }, 'rpc call failed');
      throw new ConnectError('internal error', Code.Internal, {
        [correlationIdHeader]: correlationId,
      });
    }
  };
}
