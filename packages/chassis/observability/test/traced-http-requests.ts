import { fastify } from 'fastify';

const server = fastify();
server.get('/health', () => ({ status: 'ok' }));
server.get('/orders/:orderId', () => ({ status: 'APPROVED' }));
const url = await server.listen({ host: '127.0.0.1', port: 0 });
await fetch(`${url}/health`);
await fetch(`${url}/orders/0199a5d0-0000-7000-8000-0000000000a1`);
await server.close();
