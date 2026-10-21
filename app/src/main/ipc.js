'use strict';

const { openUrl, runLegacyCommandLine, launchAppById } = require('./launcher');

/**
 * Register IPC handlers with strict payload validation.
 *
 * Channels:
 *  - `openUrl` (url: string) — allowlisted https only
 *  - `launch-app` (id: string) — one of config.APPS ids (preferred)
 *  - `exec` (cmdLine: string) — deprecated, exact-allowlist only
 *
 * @param {object} deps { ipcMain, launcher?, log? }
 * @returns {Function} cleanup unregister function
 */
function registerIpcHandlers(deps = {}) {
  const { ipcMain } = deps;
  if (!ipcMain || typeof ipcMain.on !== 'function') throw new Error('ipcMain is required');

  const launcher = deps.launcher || { openUrl, runLegacyCommandLine, launchAppById };
  const log = deps.log || { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };

  const onOpenUrl = (_event, url) => {
    try {
      launcher.openUrl(url);
    } catch (err) {
      log.error(`Blocked openUrl: ${err.message}`);
    }
  };

  const onLaunchApp = (_event, id) => {
    try {
      launcher.launchAppById(id);
    } catch (err) {
      log.error(`Blocked launch-app: ${err.message}`);
    }
  };

  const onExec = (_event, cmd) => {
    try {
      launcher.runLegacyCommandLine(cmd);
    } catch (err) {
      log.error(`Blocked exec: ${err.message}`);
    }
  };

  ipcMain.on('openUrl', onOpenUrl);
  ipcMain.on('launch-app', onLaunchApp);
  ipcMain.on('exec', onExec);

  return () => {
    if (typeof ipcMain.removeListener === 'function') {
      ipcMain.removeListener('openUrl', onOpenUrl);
      ipcMain.removeListener('launch-app', onLaunchApp);
      ipcMain.removeListener('exec', onExec);
    }
  };
}

module.exports = { registerIpcHandlers };
