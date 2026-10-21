'use strict';

/**
 * Preload bridge — minimal, validated, testable.
 * `createPreloadApi` is pure and unit-tested; the auto-wire below only runs
 * inside a real Electron preload (where `require('electron')` works).
 */

function createPreloadApi({ contextBridge, ipcRenderer }) {
  if (!contextBridge || typeof contextBridge.exposeInMainWorld !== 'function') {
    throw new Error('contextBridge is required');
  }
  if (!ipcRenderer || typeof ipcRenderer.send !== 'function') {
    throw new Error('ipcRenderer is required');
  }

  const api = {
    openUrl: (url) => {
      if (typeof url !== 'string') throw new TypeError('url must be a string');
      ipcRenderer.send('openUrl', url);
    },
    launchApp: (id) => {
      if (typeof id !== 'string') throw new TypeError('id must be a string');
      ipcRenderer.send('launch-app', id);
    },
    exec: (cmd) => {
      if (typeof cmd !== 'string') throw new TypeError('cmd must be a string');
      ipcRenderer.send('exec', cmd);
    },
  };

  contextBridge.exposeInMainWorld('api', api);
  return api;
}

function isValidChannel(channel) {
  return channel === 'openUrl' || channel === 'launch-app' || channel === 'exec';
}

let api = null;
/* istanbul ignore next -- electron preload runtime only, covered by Playwright E2E */
/* v8 ignore next -- electron preload runtime only, covered by Playwright E2E */
try {
  // eslint-disable-next-line global-require
  const electron = require('electron');
  if (electron && electron.contextBridge && electron.ipcRenderer) {
    console.log('Preload loaded');
    api = createPreloadApi({ contextBridge: electron.contextBridge, ipcRenderer: electron.ipcRenderer });
  }
} catch (err) {
  console.error(`Preload failed: ${err.message}`);
}

module.exports = { createPreloadApi, isValidChannel, api };
