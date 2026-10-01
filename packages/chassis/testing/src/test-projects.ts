import { defineConfig, type ViteUserConfig } from 'vitest/config';

export const testProjects: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.{integration,component,golden,e2e}.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.spec.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
