'use strict';

let electronApi = null;
/* istanbul ignore next -- electron runtime only, covered by Playwright E2E */
/* v8 ignore next -- electron runtime only, covered by Playwright E2E */
try {
  // In unit tests / plain node, `electron` resolves to a path string or is
  // absent — never crash at import time.
  const maybeElectron = require('electron');
  if (maybeElectron && typeof maybeElectron === 'object' && maybeElectron.app) {
    electronApi = maybeElectron;
  }
} catch {
  electronApi = null;
}
const path = require('node:path');

const { TV } = require('./config');
const { createWindow } = require('./window');
const { registerIpcHandlers } = require('./ipc');
const { HyperionController } = require('./hyperion');
const { TvMonitor } = require('./tv-monitor');

function shouldAutoStartHyperion(env = process.env) {
  return env.NODE_ENV !== 'test' && env.VITEST !== 'true' && env.TV_LAUNCHER_E2E !== '1' && env.APP_TEST_DRIVER !== '1';
}

/**
 * Composition root — wires window + IPC + hyperion + TV monitor.
 * All collaborators are injectable for tests / E2E dry-run.
 */
function createApp(deps = {}) {
  const electronApp = deps.app || (electronApi && electronApi.app) || null;
  const BrowserWindowClass = deps.BrowserWindow || (electronApi && electronApi.BrowserWindow) || null;
  const ipc = deps.ipcMain || (electronApi && electronApi.ipcMain) || null;
  const log = deps.log || { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };
  const env = deps.env || process.env;
  const tvAutoStart = deps.tvAutoStart ?? TV.autoStart;

  const hyperion = deps.hyperion || new HyperionController({ env, log });
  const tvMonitor =
    deps.tvMonitor ||
    new TvMonitor({
      hyperion,
      pollIntervalMs: (deps.tvPollMs ?? TV.pollIntervalMs),
      log,
    });

  let unregisterIpc = null;

  const boot = () => {
    if (!ipc) throw new Error('ipcMain is required');
    unregisterIpc = registerIpcHandlers({ ipcMain: ipc, log });
    if (shouldAutoStartHyperion(env)) {
      hyperion.start();
      if (tvAutoStart) tvMonitor.start();
    } else {
      log.info('[main] test/e2e mode: skipping hyperion autostart');
    }
  };

  const createMainWindow = () => {
    if (!BrowserWindowClass) throw new Error('BrowserWindow is required');
    return createWindow({
      BrowserWindow: BrowserWindowClass,
      indexPath: deps.indexPath || path.join(__dirname, '..', 'renderer', 'index.html'),
      preloadPath: deps.preloadPath || path.join(__dirname, '..', 'preload', 'preload.js'),
      windowOptions: deps.windowOptions,
    });
  };

  const attachLifecycle = () => {
    if (!electronApp) throw new Error('app is required');
    electronApp.whenReady().then(() => {
      createMainWindow();
      electronApp.on('activate', () => {
        if (BrowserWindowClass.getAllWindows && BrowserWindowClass.getAllWindows().length === 0) {
          createMainWindow();
        }
      });
    });

    electronApp.on('window-all-closed', () => {
      if (process.platform !== 'darwin') electronApp.quit();
    });

    const cleanup = () => {
      try {
        hyperion.stop({ block: true });
      } catch (err) {
        log.error(`Error executing command: ${err.message}`);
      }
      tvMonitor.stop();
      if (unregisterIpc) unregisterIpc();
    };

    process.once('beforeExit', cleanup);
    process.once('exit', cleanup);
    if (typeof electronApp.once === 'function') {
      electronApp.once('before-quit', cleanup);
    }
    return cleanup;
  };

  return { boot, createMainWindow, attachLifecycle, hyperion, tvMonitor, shouldAutoStartHyperion: () => shouldAutoStartHyperion(env) };
}

let singleton = null;

/* istanbul ignore next -- entry-point bootstrap, covered by Playwright E2E */
/* v8 ignore next -- entry-point bootstrap, covered by Playwright E2E */
function bootSingleton() {
  if (singleton) return singleton;
  singleton = createApp({});
  singleton.boot();
  singleton.attachLifecycle();
  return singleton;
}

// Auto-boot when running inside real Electron (require('electron') resolved to
// the real API). Under Vitest / plain node `electronApi` is null, so importing
// this module has no side effects and unit tests stay hermetic.
// (Deliberately not `require.main === module`: under `electron .` require.main
// is Electron's loader, not this file, so that check would never boot.)
/* istanbul ignore next -- entry-point bootstrap, covered by Playwright E2E */
/* v8 ignore next -- entry-point bootstrap, covered by Playwright E2E */
if (electronApi && electronApi.app) {
  bootSingleton();
}

module.exports = { createApp, bootSingleton, shouldAutoStartHyperion, get __testSingleton() { return singleton; } };
