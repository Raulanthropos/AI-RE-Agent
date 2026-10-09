import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node server/dist/worker.js && node server/dist/index.js",
      url: "http://127.0.0.1:3101/api/health",
      env: { DATABASE_PATH: "../.test-data/browser.sqlite", PORT: "3101" },
      reuseExistingServer: false,
      stdout: "pipe",
      timeout: 60_000,
    },
    {
      command: "npm run preview -w @ai-re-agent/web -- --port 4174",
      url: "http://127.0.0.1:4174",
      env: { API_TARGET: "http://127.0.0.1:3101" },
      reuseExistingServer: false,
      stdout: "pipe",
      timeout: 60_000,
    },
  ],
});
