'use strict';

import { describe, it, expect, vi } from 'vitest';
import { createWindow } from '../../src/main/window.js';

function makeBrowserWindow() {
  const instances = [];
  class FakeWindow {
    constructor(opts) {
      this.opts = opts;
      this.webContents = {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
      };
      this.loadFile = vi.fn();
      this.setMenuBarVisibility = vi.fn();
      this.setFullScreen = vi.fn();
      instances.push(this);
    }
    static getAllWindows() {
      return [];
    }
  }
  return { FakeWindow, instances };
}

describe('createWindow', () => {
  it('throws without BrowserWindow', () => {
    expect(() => createWindow({})).toThrow(/BrowserWindow is required/);
  });

  it('creates secure fullscreen window and loads index', () => {
    const { FakeWindow, instances } = makeBrowserWindow();
    const win = createWindow({
      BrowserWindow: FakeWindow,
      indexPath: '/app/index.html',
      preloadPath: '/app/preload.js',
    });
    expect(instances).toHaveLength(1);
    expect(win.opts.fullscreen).toBe(true);
    expect(win.opts.frame).toBe(false);
    expect(win.opts.webPreferences.nodeIntegration).toBe(false);
    expect(win.opts.webPreferences.contextIsolation).toBe(true);
    expect(win.opts.webPreferences.preload).toBe('/app/preload.js');
    expect(win.loadFile).toHaveBeenCalledWith('/app/index.html');
    expect(win.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(win.setFullScreen).toHaveBeenCalledWith(true);
    expect(win.webContents.setWindowOpenHandler).toHaveBeenCalled();
    const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0];
    expect(handler()).toEqual({ action: 'deny' });
  });

  it('denies external navigation but allows file://', () => {
    const { FakeWindow, instances } = makeBrowserWindow();
    createWindow({ BrowserWindow: FakeWindow, indexPath: 'i', preloadPath: 'p' });
    const win = instances[0];
    const navHandler = win.webContents.on.mock.calls.find(([ev]) => ev === 'will-navigate')[1];
    const preventDefault = vi.fn();
    navHandler({ preventDefault }, 'https://evil.com');
    expect(preventDefault).toHaveBeenCalled();
    preventDefault.mockClear();
    navHandler({ preventDefault }, 'file:///app/index.html');
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('merges window and webPreference overrides', () => {
    const { FakeWindow, instances } = makeBrowserWindow();
    createWindow({
      BrowserWindow: FakeWindow,
      indexPath: 'i',
      preloadPath: 'p',
      windowOptions: { title: 'Custom' },
      webPreferences: { sandbox: true },
    });
    expect(instances[0].opts.title).toBe('Custom');
    expect(instances[0].opts.webPreferences.sandbox).toBe(true);
  });

  it('tolerates windows without optional methods', () => {
    class Bare {
      constructor(opts) {
        this.opts = opts;
        this.loadFile = vi.fn();
      }
    }
    expect(() => createWindow({ BrowserWindow: Bare, indexPath: 'i', preloadPath: 'p' })).not.toThrow();
  });
});
