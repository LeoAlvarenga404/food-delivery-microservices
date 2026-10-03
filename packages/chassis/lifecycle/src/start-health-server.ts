import { fastify } from 'fastify';

export interface HealthServerAddress {
  readonly host: string;
  readonly port: number;
}

export interface RunningHealthServer {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export async function startHealthServer(
  address: HealthServerAddress,
): Promise<RunningHealthServer> {
  const server = fastify();
  server.get('/health', () => ({ status: 'ok' }));
  try {
    const url = await server.listen({ host: address.host, port: address.port });
    return { url, stop: () => server.close() };
  } catch (error) {
    await server.close();
    throw error;
  }
}
