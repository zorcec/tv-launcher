'use strict';

const path = require('node:path');
const { WINDOW } = require('./config');

function defaultIndexPath() {
  return path.join(__dirname, '..', 'renderer', 'index.html');
}

function defaultPreloadPath() {
  return path.join(__dirname, '..', 'preload', 'preload.js');
}

/**
 * Create the fullscreen kiosk window with secure webPreferences.
 *
 * All Electron classes are injected so unit tests can pass fakes.
 *
 * @param {object} deps
 * @param {any} deps.BrowserWindow real or fake BrowserWindow class
 * @param {string} deps.indexPath file to load
 * @param {string} deps.preloadPath preload script
 * @param {object} deps.windowOptions overrides
 */
function createWindow(deps = {}) {
  const { BrowserWindow } = deps;
  if (!BrowserWindow) throw new Error('BrowserWindow is required');

  const indexPath = deps.indexPath || defaultIndexPath();
  // preload lives at src/preload/preload.js (sibling of main/, renderer/)
  const preloadPath = deps.preloadPath || defaultPreloadPath();

  const win = new BrowserWindow({
    ...WINDOW,
    ...(deps.windowOptions || {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: preloadPath,
      ...(deps.webPreferences || {}),
    },
  });

  if (typeof win.setMenuBarVisibility === 'function') win.setMenuBarVisibility(false);
  if (typeof win.setFullScreen === 'function' && WINDOW.fullscreen) win.setFullScreen(true);

  // Harden renderer: block popups / external navigation.
  if (win.webContents && typeof win.webContents.setWindowOpenHandler === 'function') {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
  if (win.webContents && typeof win.webContents.on === 'function') {
    win.webContents.on('will-navigate', (event, url) => {
      // Only allow the bundled file:// page to navigate internally.
      if (!String(url).startsWith('file://')) {
        event.preventDefault();
      }
    });
  }

  win.loadFile(indexPath);
  return win;
}

module.exports = { createWindow, defaultIndexPath, defaultPreloadPath };
