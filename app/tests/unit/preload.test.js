'use strict';

import { describe, it, expect, vi } from 'vitest';
import { createPreloadApi, isValidChannel } from '../../src/preload/preload.js';

function makeElectron() {
  return {
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { send: vi.fn() },
  };
}

describe('preload', () => {
  it('exposes api with openUrl/launchApp/exec', () => {
    const electron = makeElectron();
    const api = createPreloadApi(electron);
    expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object));
    expect(Object.keys(api).sort()).toEqual(['exec', 'launchApp', 'openUrl']);

    api.openUrl('https://youtube.com');
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('openUrl', 'https://youtube.com');
    api.launchApp('steam');
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('launch-app', 'steam');
    api.exec('flatpak run com.valvesoftware.SteamLink');
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('exec', 'flatpak run com.valvesoftware.SteamLink');
  });

  it('validates argument types', () => {
    const electron = makeElectron();
    const api = createPreloadApi(electron);
    expect(() => api.openUrl(123)).toThrow(TypeError);
    expect(() => api.launchApp(null)).toThrow(TypeError);
    expect(() => api.exec({})).toThrow(TypeError);
  });

  it('requires contextBridge and ipcRenderer', () => {
    expect(() => createPreloadApi({})).toThrow(/contextBridge/);
    expect(() => createPreloadApi({ contextBridge: { exposeInMainWorld: vi.fn() } })).toThrow(/ipcRenderer/);
    expect(() =>
      createPreloadApi({ contextBridge: {}, ipcRenderer: { send: vi.fn() } })
    ).toThrow(/contextBridge/);
    expect(() =>
      createPreloadApi({ contextBridge: { exposeInMainWorld: vi.fn() }, ipcRenderer: {} })
    ).toThrow(/ipcRenderer/);
  });

  it('exports isValidChannel helper', () => {
    expect(isValidChannel('openUrl')).toBe(true);
    expect(isValidChannel('launch-app')).toBe(true);
    expect(isValidChannel('exec')).toBe(true);
    expect(isValidChannel('rm -rf')).toBe(false);
  });
});
