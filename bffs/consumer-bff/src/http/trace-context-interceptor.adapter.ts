import type { Interceptor } from '@connectrpc/connect';
import { activeTraceparent, runInClientSpan } from '@fd/chassis-observability';

export const traceContextInterceptor: Interceptor = (next) => (request) => {
  const settings = {
    name: `${request.service.typeName}/${request.method.name}`,
    attributes: {
      'rpc.system': 'connect_rpc',
      'rpc.service': request.service.typeName,
      'rpc.method': request.method.name,
    },
  };
  return runInClientSpan(settings, () => {
    const traceparent = activeTraceparent();
    if (traceparent !== undefined) request.header.set('traceparent', traceparent);
    return next(request);
  });
};
