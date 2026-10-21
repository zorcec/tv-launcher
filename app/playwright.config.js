const { defineConfig, devices } = require('@playwright/test');

/**
 * E2E for the Electron kiosk app.
 * Launches the real app via Playwright's Electron fixture in dry-run mode
 * (TV_LAUNCHER_E2E=1) so no real firefox/hyperion/xrandr processes spawn.
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'on-first-retry' },
  projects: [{ name: 'electron', use: { ...devices['Desktop Chrome'] } }],
});
