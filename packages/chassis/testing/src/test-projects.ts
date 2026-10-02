import { defineConfig, type ViteUserConfig } from 'vitest/config';

const containerTimeoutInMilliseconds = 120_000;

function specsOfKind(kind: string): string[] {
  return [`src/**/*.${kind}.spec.ts`, `test/**/*.${kind}.spec.ts`];
}

export const testProjects: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
          exclude: ['integration', 'component', 'golden', 'e2e'].flatMap(specsOfKind),
        },
      },
      {
        test: {
          name: 'integration',
          include: specsOfKind('integration'),
          testTimeout: containerTimeoutInMilliseconds,
          hookTimeout: containerTimeoutInMilliseconds,
        },
      },
      {
        test: {
          name: 'golden',
          include: specsOfKind('golden'),
        },
      },
      {
        test: {
          name: 'component',
          include: specsOfKind('component'),
          testTimeout: containerTimeoutInMilliseconds,
          hookTimeout: containerTimeoutInMilliseconds,
        },
      },
    ],
  },
});
