import { defineConfig, devices } from '@playwright/test';

import { buildE2eApiEnv, defaultE2eDatabaseUrl, e2eUrls, e2eWebEnv } from './tests/e2e/data/env';

// E2E: docs/development/testing.md → E2E scenarios. Starts the API (on the test database) and the
// web app, and waits for /api/v1/health before any spec runs.

const e2eDatabaseUrl = process.env.DATABASE_URL_TEST ?? defaultE2eDatabaseUrl;
if (!new URL(e2eDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('E2E refuses a database whose name does not end in _test (DATABASE_URL_TEST).');
}

// Cloud sessions: Chromium is preinstalled; point at it only when asked (testing skill →
// references/playwright-cloud.md). Locally, `pnpm exec playwright install chromium` once.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  // In CI: failure annotations on the PR, and each test's progress in the log.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: e2eUrls.web,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      cwd: '../Trello-Clone-BE',
      command: 'pnpm exec prisma migrate deploy && pnpm exec tsx src/server.ts',
      url: e2eUrls.health,
      env: buildE2eApiEnv(e2eDatabaseUrl),
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: `pnpm exec vite --port ${new URL(e2eUrls.web).port} --strictPort`,
      url: e2eUrls.web,
      env: e2eWebEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
