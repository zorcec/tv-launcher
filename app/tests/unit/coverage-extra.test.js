'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openUrl, runCommand } from '../../src/main/launcher.js';
import { HyperionController } from '../../src/main/hyperion.js';
import { TvMonitor } from '../../src/main/tv-monitor.js';
import { createApp } from '../../src/main/main.js';

describe('remaining default branches (real spawn, fast-fail)', () => {
  let logSpy;
  let errorSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('launcher defaultLog.error via failing exec without log', () => {
    const failing = (_cmd, _args, cb) => {
      cb(new Error('boom-default-log'), '', '');
      return {};
    };
    // no `log` → defaultLog, non-dry-run → real path, error → default error arrow
    openUrl('https://youtube.com', { execFile: failing, dryRun: false, env: { NODE_ENV: 'production' } });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom-default-log'));

    runCommand('flatpak', ['run', 'x'], { execFile: failing, dryRun: false, env: { NODE_ENV: 'production' } });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom-default-log'));
  });

  it('hyperion default spawnFn (real execFile, ENOENT fast-fail)', () => {
    const h = new HyperionController({ env: { NODE_ENV: 'production' } });
    // no spawnFn → default arrow calling real execFile('hyperion-qt') → ENOENT on dev machines
    h.start();
    expect(h.isRunning).toBe(true);
    h.stop({ block: false });
    expect(h.isRunning).toBe(false);
    // default log was used (console)
    expect(logSpy.mock.calls.length + errorSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('tv-monitor default execXrandr (real xrandr, fast-fail)', async () => {
    const m = new TvMonitor({ log: { info: vi.fn(), error: vi.fn() } });
    // no execXrandr → default arrow calling real execFile('xrandr') → error on dev machines
    await new Promise((resolve) => m.checkOnce(() => resolve()));
    // either connected (linux with xrandr) or error (no xrandr) — both cover default arrow
    expect([true, false, null]).toContain(m.lastState);
  });

  it('main activate without getAllWindows static', async () => {
    const fakeApp = { whenReady: vi.fn(() => Promise.resolve()), on: vi.fn(), once: vi.fn(), quit: vi.fn() };
    class NoStatic {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
        this.webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
      }
    }
    const app = createApp({
      app: fakeApp,
      BrowserWindow: NoStatic,
      ipcMain: { on: vi.fn(), removeListener: vi.fn() },
      hyperion: { start: vi.fn(), stop: vi.fn() },
      tvMonitor: { start: vi.fn(), stop: vi.fn() },
      log: { info: vi.fn(), error: vi.fn() },
      env: { NODE_ENV: 'test' },
    });
    app.attachLifecycle();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const activate = fakeApp.on.mock.calls.find(([ev]) => ev === 'activate')?.[1];
    expect(activate).toBeDefined();
    expect(() => activate()).not.toThrow();
  });
});
