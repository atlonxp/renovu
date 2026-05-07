import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone Playwright config for the multi-project E2E suite.
 *
 * Targets the existing dev dashboard at localhost:4000 (no test server spin-up
 * required) and skips the Clerk-based session helpers. Tests bypass auth by
 * registering a fresh user via the API and injecting the JWT into localStorage.
 *
 * Run from apps/dashboard:
 *   npx playwright test --config=tests/multi-project.config.ts
 */
const BASE_URL = process.env.DASHBOARD_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/multi-project.e2e.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'multi-project-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
