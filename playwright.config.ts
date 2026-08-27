import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * End-to-end tests exercise the real, built production server (same
 * Dockerfile artifact, same STATIC_DIR-served frontend) rather than a dev
 * server, so a pass here means the actual deployable thing works.
 *
 * All spec files share one running server instance and one SQLite database
 * for the whole run (Playwright starts webServer once, not per test), so
 * tests use unique emails per run rather than assuming a clean database.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server/dist/index.js > e2e/.tmp/server.log 2>&1',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_PATH: './e2e/.tmp/e2e.db',
      STATIC_DIR: 'client/dist',
      AUTH_SECRET: 'e2e-test-secret-not-for-production-use-12345',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'e2e-admin-password',
      RETENTION_CHECK_INTERVAL_HOURS: '0',
      REMINDER_CHECK_INTERVAL_MINUTES: '0',
    },
  },
});
