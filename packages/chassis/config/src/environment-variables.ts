import { z } from 'zod';

export const environmentVariables = {
  postgresUrl: z.string().regex(/^postgres(?:ql)?:\/\//),
  kafkaBootstrapServers: z
    .string()
    .transform((servers) =>
      servers
        .split(',')
        .map((server) => server.trim())
        .filter((server) => server.length > 0),
    )
    .pipe(z.array(z.string()).min(1)),
  httpUrl: z.url({ protocol: /^https?$/ }),
  listenHost: z.string().min(1).default('127.0.0.1'),
  listenPort: z.coerce.number().int().min(1).max(65_535),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  durationInMilliseconds: z.coerce.number().int().min(1).max(2_147_483_647),
};
