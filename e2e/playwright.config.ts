import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'browser',
  testMatch: '*.e2e.spec.ts',
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: process.env['E2E_SITE_URL'] ?? 'http://localhost:8080',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
});
