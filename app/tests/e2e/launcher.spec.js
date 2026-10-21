'use strict';

const path = require('node:path');
const { test, expect, _electron: electron } = require('@playwright/test');

// app/ is the Electron project root (package.json main = src/main/main.js)
const appRoot = path.join(__dirname, '..', '..');

test.describe('TV launcher (Electron)', () => {
  let electronApp;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      cwd: appRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TV_LAUNCHER_E2E: '1',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('boots to a window with title', async () => {
    // firstWindow waits for the BrowserWindow (app.whenReady flow).
    await electronApp.firstWindow();
    const windowState = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      const win = wins[0];
      return {
        count: wins.length,
        title: win?.getTitle?.() ?? null,
      };
    });
    expect(windowState.count).toBe(1);
    expect(windowState.title).toMatch(/TV Launcher/i);
  });

  test('renders all four app tiles + background video', async () => {
    const window = await electronApp.firstWindow();
    await window.waitForSelector('[data-testid="app-primevideo"]');
    for (const id of ['primevideo', 'gonet', 'youtube', 'steam']) {
      await expect(window.locator(`[data-testid="app-${id}"]`)).toBeVisible();
    }
    await expect(window.locator('[data-testid="background-video"]')).toBeAttached();
    await expect(window).toHaveTitle(/TV Launcher/i);
  });

  test('clicking tiles does not crash (dry-run launcher)', async () => {
    const window = await electronApp.firstWindow();
    for (const id of ['primevideo', 'gonet', 'youtube', 'steam']) {
      await window.locator(`[data-testid="app-${id}"]`).click();
    }
    // app still alive with one window after all clicks
    const count = await electronApp.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(count).toBe(1);
  });

  test('screenshot smoke', async () => {
    const window = await electronApp.firstWindow();
    await window.screenshot({ path: path.join(appRoot, 'tests', 'e2e', 'intro.png') });
  });
});
