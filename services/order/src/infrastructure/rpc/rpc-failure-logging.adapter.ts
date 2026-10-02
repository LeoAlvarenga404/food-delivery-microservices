import { Code, ConnectError, createContextKey, type Interceptor } from '@connectrpc/connect';
import type { Logger } from '@fd/chassis-observability';
import { isUuid } from '@fd/domain';

export interface RpcFailureLoggingSettings {
  readonly logger: Logger;
  readonly generateCorrelationId: () => string;
}

export const correlationIdKey = createContextKey<string>('', {
  description: 'correlation id of the current rpc call',
});

export const correlationIdHeader = 'x-correlation-id';

export function createRpcFailureLogging(settings: RpcFailureLoggingSettings): Interceptor {
  return (next) => async (request) => {
    const incomingCorrelationId = request.header.get(correlationIdHeader);
    const correlationId =
      incomingCorrelationId !== null && isUuid(incomingCorrelationId)
        ? incomingCorrelationId
        : settings.generateCorrelationId();
    request.contextValues.set(correlationIdKey, correlationId);
    try {
      const response = await next(request);
      response.header.set(correlationIdHeader, correlationId);
      return response;
    } catch (error) {
      if (error instanceof ConnectError) throw error;
      const procedure = `${request.service.typeName}/${request.method.name}`;
      settings.logger.error({ err: error, procedure, correlationId }, 'rpc call failed');
      throw new ConnectError('internal error', Code.Internal);
    }
  };
}
