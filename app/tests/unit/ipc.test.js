'use strict';

import { describe, it, expect, vi } from 'vitest';
import { registerIpcHandlers } from '../../src/main/ipc.js';

function makeIpc() {
  const handlers = {};
  return {
    handlers,
    ipcMain: {
      on: vi.fn((channel, fn) => {
        handlers[channel] = fn;
      }),
      removeListener: vi.fn((channel) => {
        delete handlers[channel];
      }),
    },
  };
}

function silentLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('registerIpcHandlers', () => {
  it('throws without ipcMain', () => {
    expect(() => registerIpcHandlers({})).toThrow(/ipcMain is required/);
    expect(() => registerIpcHandlers({ ipcMain: {} })).toThrow();
  });

  it('registers openUrl, launch-app and exec channels', () => {
    const { ipcMain } = makeIpc();
    const cleanup = registerIpcHandlers({ ipcMain, log: silentLog() });
    expect(ipcMain.on).toHaveBeenCalledWith('openUrl', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('launch-app', expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith('exec', expect.any(Function));
    expect(typeof cleanup).toBe('function');
  });

  it('forwards openUrl and logs blocked urls', () => {
    const { ipcMain, handlers } = makeIpc();
    const launcher = { openUrl: vi.fn(), launchAppById: vi.fn(), runLegacyCommandLine: vi.fn() };
    const log = silentLog();
    registerIpcHandlers({ ipcMain, launcher, log });
    handlers.openUrl({}, 'https://youtube.com');
    expect(launcher.openUrl).toHaveBeenCalledWith('https://youtube.com');
    launcher.openUrl.mockImplementation(() => {
      throw new Error('nope');
    });
    handlers.openUrl({}, 'https://evil.com');
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Blocked openUrl'));
  });

  it('forwards launch-app and logs unknown ids', () => {
    const { handlers, ipcMain } = makeIpc();
    const launcher = { openUrl: vi.fn(), launchAppById: vi.fn(), runLegacyCommandLine: vi.fn() };
    const log = silentLog();
    registerIpcHandlers({ ipcMain, launcher, log });
    handlers['launch-app']({}, 'steam');
    expect(launcher.launchAppById).toHaveBeenCalledWith('steam');
    launcher.launchAppById.mockImplementation(() => {
      throw new Error('bad id');
    });
    handlers['launch-app']({}, 'nope');
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Blocked launch-app'));
  });

  it('forwards exec and logs blocked commands', () => {
    const { handlers, ipcMain } = makeIpc();
    const launcher = { openUrl: vi.fn(), launchAppById: vi.fn(), runLegacyCommandLine: vi.fn() };
    const log = silentLog();
    registerIpcHandlers({ ipcMain, launcher, log });
    handlers.exec({}, 'flatpak run com.valvesoftware.SteamLink');
    expect(launcher.runLegacyCommandLine).toHaveBeenCalled();
    launcher.runLegacyCommandLine.mockImplementation(() => {
      throw new Error('blocked');
    });
    handlers.exec({}, 'rm -rf /');
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Blocked exec'));
  });

  it('cleanup removes listeners', () => {
    const { ipcMain } = makeIpc();
    const cleanup = registerIpcHandlers({ ipcMain, log: silentLog() });
    cleanup();
    expect(ipcMain.removeListener).toHaveBeenCalledWith('openUrl', expect.any(Function));
    expect(ipcMain.removeListener).toHaveBeenCalledWith('launch-app', expect.any(Function));
    expect(ipcMain.removeListener).toHaveBeenCalledWith('exec', expect.any(Function));
  });

  it('cleanup tolerates ipcMain without removeListener', () => {
    const ipcMain = { on: vi.fn() };
    const cleanup = registerIpcHandlers({ ipcMain, log: silentLog() });
    expect(() => cleanup()).not.toThrow();
  });
});
