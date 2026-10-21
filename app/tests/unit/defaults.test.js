'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openUrl,
  runCommand,
  launchAppById,
  runLegacyCommandLine,
  isTestMode,
} from '../../src/main/launcher.js';
import { HyperionController } from '../../src/main/hyperion.js';
import { TvMonitor } from '../../src/main/tv-monitor.js';
import { createWindow, defaultIndexPath, defaultPreloadPath } from '../../src/main/window.js';
import { registerIpcHandlers } from '../../src/main/ipc.js';
import { createApp } from '../../src/main/main.js';

describe('default-dependency branches (no injection)', () => {
  let logSpy;
  let errorSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('launcher uses defaultLog and default env', () => {
    // default env (process.env is test in vitest) → dry-run, no spawn, uses defaultLog
    expect(isTestMode()).toBe(true);
    expect(openUrl('https://youtube.com')).toEqual({ dryRun: true, url: 'https://youtube.com' });
    expect(runCommand('flatpak', ['run', 'x'])).toEqual({ dryRun: true, command: 'flatpak', args: ['run', 'x'] });
    expect(launchAppById('youtube')).toEqual({ dryRun: true, url: 'https://youtube.com' });
    expect(runLegacyCommandLine('flatpak run com.valvesoftware.SteamLink')).toEqual({
      dryRun: true,
      command: 'flatpak',
      args: ['run', 'com.valvesoftware.SteamLink'],
    });
    expect(logSpy).toHaveBeenCalled();
  });

  it('launcher tryNative logs all branches on fallback', () => {
    const log = { info: vi.fn(), error: vi.fn() };

    // ENOENT → fallback native reports error
    openUrl('https://youtube.com', {
      execFile: (cmd, _a, cb) => {
        if (cmd === 'flatpak') {
          const e = new Error('missing');
          e.code = 'ENOENT';
          cb(e, '', '');
        } else {
          cb(new Error('native boom'), '', '');
        }
        return {};
      },
      log,
      dryRun: false,
    });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('native boom'));

    // ENOENT → fallback native reports stderr
    const log2 = { info: vi.fn(), error: vi.fn() };
    openUrl('https://youtube.com', {
      execFile: (cmd, _a, cb) => {
        if (cmd === 'flatpak') {
          const e = new Error('missing');
          e.code = 'ENOENT';
          cb(e, '', '');
        } else {
          cb(null, '', 'native warn');
        }
        return {};
      },
      log: log2,
      dryRun: false,
    });
    expect(log2.error).toHaveBeenCalledWith('stderr: native warn');

    // ENOENT → fallback native reports stdout
    const log3 = { info: vi.fn(), error: vi.fn() };
    openUrl('https://youtube.com', {
      execFile: (cmd, _a, cb) => {
        if (cmd === 'flatpak') {
          const e = new Error('missing');
          e.code = 'ENOENT';
          cb(e, '', '');
        } else {
          cb(null, 'native out', '');
        }
        return {};
      },
      log: log3,
      dryRun: false,
    });
    expect(log3.info).toHaveBeenCalledWith('stdout: native out');
  });

  it('hyperion defaults work without injection', () => {
    const h = new HyperionController();
    expect(h.isDryRun()).toBe(true); // vitest sets NODE_ENV=test
    const child = h.start();
    expect(child.dryRun).toBe(true);
    h.stop();
    expect(h.isRunning).toBe(false);
    expect(logSpy).toHaveBeenCalled();
  });

  it('hyperion handles child without .on and null spawn return', () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const h1 = new HyperionController({
      spawnFn: () => ({ kill: vi.fn() }), // no .on
      log,
      env: {},
    });
    const c1 = h1.start();
    expect(c1.kill).toBeDefined();
    expect(log.error).not.toHaveBeenCalled();

    const h2 = new HyperionController({
      spawnFn: (_c, _a, cb) => {
        cb(null, '', '');
        return null; // falsy → fallback {kill}
      },
      log,
      env: {},
    });
    const c2 = h2.start();
    expect(typeof c2.kill).toBe('function');
  });

  it('tv-monitor defaults and edge timers', () => {
    // default log (no log passed), no hyperion
    const m = new TvMonitor({ execXrandr: (cb) => cb(null, 'HDMI-1 connected') });
    m.checkOnce();
    expect(m.lastState).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('Tv detected', true);

    // default connector + default poll interval + no-unref timer
    const m2 = new TvMonitor({
      execXrandr: (cb) => cb(null, 'HDMI-1 disconnected'),
      hyperion: null,
      log: { info: vi.fn(), error: vi.fn() },
    });
    // fake timer without unref
    const origSetInterval = global.setInterval;
    global.setInterval = vi.fn(() => ({}));
    try {
      m2.start();
      expect(m2.isWatching).toBe(true);
      m2.stop();
      expect(m2.isWatching).toBe(false);
    } finally {
      global.setInterval = origSetInterval;
    }

    // stop with no timer is safe + checkOnce without callback and empty stdout
    const m3 = new TvMonitor({
      execXrandr: (cb) => cb(null, ''),
      log: { info: vi.fn(), error: vi.fn() },
    });
    expect(() => m3.stop()).not.toThrow();
    m3.checkOnce();
    expect(m3.lastState).toBe(false);
  });

  it('window defaults and missing-method branches', () => {
    expect(defaultIndexPath()).toMatch(/index\.html$/);
    expect(defaultPreloadPath()).toMatch(/preload\.js$/);

    class Minimal {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
      }
    }
    // uses defaultIndexPath + defaultPreloadPath, no optional methods
    const w1 = createWindow({ BrowserWindow: Minimal });
    expect(w1.loadFile).toHaveBeenCalledWith(expect.stringContaining('index.html'));
    expect(w1.opts.webPreferences.preload).toMatch(/preload\.js$/);

    // webContents present but without setWindowOpenHandler/on
    class NoHandlers {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
        this.webContents = {};
      }
    }
    expect(() => createWindow({ BrowserWindow: NoHandlers, indexPath: 'i', preloadPath: 'p' })).not.toThrow();

    // webContents.on present, will-navigate with file:// covered elsewhere; also cover setFullScreen missing
    class NoFullScreen {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
        this.setMenuBarVisibility = vi.fn();
        this.webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
      }
    }
    createWindow({ BrowserWindow: NoFullScreen, indexPath: 'i', preloadPath: 'p' });
  });

  it('ipc defaults use real launcher in dry-run', () => {
    const handlers = {};
    const ipcMain = {
      on: vi.fn((ch, fn) => {
        handlers[ch] = fn;
      }),
      removeListener: vi.fn(),
    };
    const cleanup = registerIpcHandlers({ ipcMain });
    expect(ipcMain.on).toHaveBeenCalledTimes(3);
    // default launcher → dry-run (no spawn), default log → console
    handlers.openUrl({}, 'https://youtube.com');
    handlers['launch-app']({}, 'steam');
    handlers.exec({}, 'flatpak run com.valvesoftware.SteamLink');
    // blocked paths still log via default console.error
    handlers.openUrl({}, 'https://evil.com');
    handlers['launch-app']({}, 'nope');
    handlers.exec({}, 'rm -rf /');
    expect(errorSpy).toHaveBeenCalled();
    cleanup();
  });

  it('main defaults create hyperion/monitor with env/log fallbacks', () => {
    const fakeApp = { whenReady: vi.fn(() => Promise.resolve()), on: vi.fn(), once: vi.fn(), quit: vi.fn() };
    class FakeWindow {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
        this.webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
      }
      static getAllWindows() {
        return [];
      }
    }
    const fakeIpc = { on: vi.fn(), removeListener: vi.fn() };
    // no hyperion/tvMonitor/log/env → defaults (env=process.env=test → dry-run)
    const app = createApp({ app: fakeApp, BrowserWindow: FakeWindow, ipcMain: fakeIpc });
    expect(app.hyperion).toBeDefined();
    expect(app.tvMonitor).toBeDefined();
    app.boot(); // dry-run, uses default console log
    expect(app.hyperion.isRunning).toBe(false);
    const cleanup = app.attachLifecycle();
    expect(typeof cleanup).toBe('function');
    // app without .once
    const noOnceApp = { whenReady: vi.fn(() => Promise.resolve()), on: vi.fn(), quit: vi.fn() };
    const app2 = createApp({
      app: noOnceApp,
      BrowserWindow: FakeWindow,
      ipcMain: fakeIpc,
      hyperion: { start: vi.fn(), stop: vi.fn() },
      tvMonitor: { start: vi.fn(), stop: vi.fn() },
      log: { info: vi.fn(), error: vi.fn() },
      env: { NODE_ENV: 'test' },
    });
    app2.boot();
    expect(() => app2.attachLifecycle()).not.toThrow();
  });
});
