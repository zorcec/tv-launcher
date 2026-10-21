'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, shouldAutoStartHyperion } from '../../src/main/main.js';

describe('main composition root', () => {
  let origEnv;
  beforeEach(() => {
    origEnv = { ...process.env };
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  function makeDeps(overrides = {}) {
    const fakeApp = {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      once: vi.fn(),
      quit: vi.fn(),
    };
    const createdWindows = [];
    class FakeWindow {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
        this.webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
        this.setMenuBarVisibility = vi.fn();
        this.setFullScreen = vi.fn();
        createdWindows.push(this);
      }
      static getAllWindows() {
        return FakeWindow._all || [];
      }
    }
    FakeWindow._all = [];
    FakeWindow._created = createdWindows;
    const fakeIpc = { on: vi.fn(), removeListener: vi.fn() };
    const hyperion = { start: vi.fn(), stop: vi.fn() };
    const tvMonitor = { start: vi.fn(), stop: vi.fn() };
    const log = { info: vi.fn(), error: vi.fn() };
    return {
      deps: {
        app: fakeApp,
        BrowserWindow: FakeWindow,
        ipcMain: fakeIpc,
        hyperion,
        tvMonitor,
        log,
        env: { NODE_ENV: 'test' },
        ...overrides,
      },
      fakeApp,
      FakeWindow,
      fakeIpc,
      hyperion,
      tvMonitor,
      log,
    };
  }

  it('shouldAutoStartHyperion respects test env flags', () => {
    expect(shouldAutoStartHyperion({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldAutoStartHyperion({ VITEST: 'true' })).toBe(false);
    expect(shouldAutoStartHyperion({ TV_LAUNCHER_E2E: '1' })).toBe(false);
    expect(shouldAutoStartHyperion({ APP_TEST_DRIVER: '1' })).toBe(false);
    expect(shouldAutoStartHyperion({ NODE_ENV: 'production' })).toBe(true);
    expect(shouldAutoStartHyperion({})).toBe(true);
  });

  it('boot skips hyperion autostart in test mode', () => {
    const { deps, hyperion, tvMonitor, log } = makeDeps();
    const app = createApp(deps);
    app.boot();
    expect(hyperion.start).not.toHaveBeenCalled();
    expect(tvMonitor.start).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('skipping hyperion'));
  });

  it('boot starts hyperion in production and tv monitor when autoStart enabled', () => {
    const { deps, hyperion, tvMonitor } = makeDeps({ env: { NODE_ENV: 'production' }, tvAutoStart: true });
    const app = createApp(deps);
    app.boot();
    expect(hyperion.start).toHaveBeenCalled();
    expect(tvMonitor.start).toHaveBeenCalled();
  });

  it('boot starts hyperion but not monitor when autoStart disabled', () => {
    const { deps, hyperion, tvMonitor } = makeDeps({ env: { NODE_ENV: 'production' }, tvAutoStart: false });
    const app = createApp(deps);
    app.boot();
    expect(hyperion.start).toHaveBeenCalled();
    expect(tvMonitor.start).not.toHaveBeenCalled();
  });

  it('boot throws without ipcMain', () => {
    const { deps } = makeDeps();
    const app = createApp({ ...deps, app: deps.app, BrowserWindow: deps.BrowserWindow, ipcMain: null });
    expect(() => app.boot()).toThrow(/ipcMain/);
  });

  it('createMainWindow throws without BrowserWindow', () => {
    const { deps } = makeDeps();
    const bare = createApp({
      app: deps.app,
      ipcMain: deps.ipcMain,
      hyperion: deps.hyperion,
      tvMonitor: deps.tvMonitor,
      log: deps.log,
      env: deps.env,
    });
    expect(() => bare.createMainWindow()).toThrow(/BrowserWindow/);
  });

  it('attachLifecycle wires ready/quit/cleanup', () => {
    const { deps, fakeApp, hyperion, tvMonitor } = makeDeps();
    const app = createApp(deps);
    app.boot();
    const beforeExitHandlers = [];
    const exitHandlers = [];
    const onceSpy = vi.spyOn(process, 'once').mockImplementation((ev, fn) => {
      if (ev === 'beforeExit') beforeExitHandlers.push(fn);
      if (ev === 'exit') exitHandlers.push(fn);
      return process;
    });
    try {
      const cleanup = app.attachLifecycle();
      expect(fakeApp.whenReady).toHaveBeenCalled();
      return Promise.resolve()
        .then(() => new Promise((r) => setImmediate(r)))
        .then(() => {
          expect(fakeApp.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
          expect(fakeApp.once).toHaveBeenCalledWith('before-quit', expect.any(Function));

          const quitHandler = fakeApp.on.mock.calls.find(([ev]) => ev === 'window-all-closed')[1];
          const origPlatform = process.platform;
          Object.defineProperty(process, 'platform', { value: 'linux' });
          quitHandler();
          expect(fakeApp.quit).toHaveBeenCalled();
          fakeApp.quit.mockClear();
          Object.defineProperty(process, 'platform', { value: 'darwin' });
          quitHandler();
          expect(fakeApp.quit).not.toHaveBeenCalled();
          Object.defineProperty(process, 'platform', { value: origPlatform });

          return new Promise((r) => setImmediate(r));
        })
        .then(() => {
          const activateHandler = fakeApp.on.mock.calls.find(([ev]) => ev === 'activate')?.[1];
          expect(activateHandler).toBeDefined();

          hyperion.stop.mockImplementationOnce(() => {
            throw new Error('stop fail');
          });
          cleanup();
          expect(tvMonitor.stop).toHaveBeenCalled();
        });
    } finally {
      onceSpy.mockRestore();
    }
  });

  it('activate does nothing when windows exist', async () => {
    const { deps, fakeApp, FakeWindow } = makeDeps();
    FakeWindow._all = [{ id: 1 }];
    const before = FakeWindow._created.length;
    const app = createApp(deps);
    app.attachLifecycle();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const activateHandler = fakeApp.on.mock.calls.find(([ev]) => ev === 'activate')?.[1];
    expect(activateHandler).toBeDefined();
    activateHandler();
    expect(FakeWindow._created.length).toBe(before + 1); // one from initial whenReady
    const afterFirst = FakeWindow._created.length;
    activateHandler();
    expect(FakeWindow._created.length).toBe(afterFirst);
  });

  it('createMainWindow delegates to createWindow', () => {
    const { deps } = makeDeps();
    const app = createApp(deps);
    const win = app.createMainWindow();
    expect(win.loadFile).toHaveBeenCalled();
  });

  it('attachLifecycle throws without app', () => {
    const { deps } = makeDeps();
    const bare = createApp({
      BrowserWindow: deps.BrowserWindow,
      ipcMain: deps.ipcMain,
      hyperion: deps.hyperion,
      tvMonitor: deps.tvMonitor,
      log: deps.log,
      env: deps.env,
    });
    expect(() => bare.attachLifecycle()).toThrow(/app is required/);
  });
});
