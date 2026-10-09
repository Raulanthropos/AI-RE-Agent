import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1100 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node server/dist/worker.js && node server/dist/index.js',
      url: 'http://127.0.0.1:3001/api/health',
      env: { DATABASE_PATH: '../.test-data/browser.sqlite', PORT: '3001' },
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60_000,
    },
    {
      command: 'npm run preview -w @ai-re-agent/web',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      stdout: 'pipe',
      timeout: 60_000,
    },
  ],
});
