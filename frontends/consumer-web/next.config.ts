import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const securityHeaders = [{ key: 'X-Frame-Options', value: 'DENY' }];

export default {
  output: 'standalone',
  outputFileTracingRoot: repositoryRoot,
  poweredByHeader: false,
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
} satisfies NextConfig;
