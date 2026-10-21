'use strict';

/**
 * Renderer wiring — data-driven, defensive against missing DOM nodes.
 * Exported `wireLauncherButtons` is what unit tests cover; the
 * DOMContentLoaded auto-wire below only runs in a real BrowserWindow.
 */

const BUTTON_ACTIONS = [
  { elementId: 'primevideo', appId: 'primevideo', legacyUrl: 'https://www.primevideo.com' },
  { elementId: 'gonet', appId: 'gonet', legacyUrl: 'https://www.gonet.tv/onlinetv/' },
  { elementId: 'youtube', appId: 'youtube', legacyUrl: 'https://youtube.com' },
  { elementId: 'steam', appId: 'steam', legacyExec: 'flatpak run com.valvesoftware.SteamLink' },
];

function getApi(win) {
  const scope = win || (typeof window !== 'undefined' ? window : undefined);
  return scope && scope.api ? scope.api : null;
}

function wireLauncherButtons(deps = {}) {
  const doc = deps.document || (typeof document !== 'undefined' ? document : undefined);
  const api = deps.api || getApi(deps.window);
  const buttons = deps.buttons || BUTTON_ACTIONS;
  const log = deps.log || { warn: (...a) => console.warn(...a) };

  if (!doc) throw new Error('document is required');
  if (!api) throw new Error('window.api is required (preload not loaded?)');

  const wired = [];

  for (const btn of buttons) {
    const el = doc.getElementById(btn.elementId);
    if (!el) {
      log.warn(`Missing button element: #${btn.elementId}`);
      continue;
    }
    const handler = () => {
      // Prefer id-based launch (main resolves + validates); fall back to
      // legacy channels if preload is old.
      if (typeof api.launchApp === 'function') {
        api.launchApp(btn.appId);
      } else if (btn.legacyUrl && typeof api.openUrl === 'function') {
        api.openUrl(btn.legacyUrl);
      } else if (btn.legacyExec && typeof api.exec === 'function') {
        api.exec(btn.legacyExec);
      }
    };
    el.addEventListener('click', handler);
    wired.push({ id: btn.elementId, handler });
  }

  return wired;
}

/* istanbul ignore next -- browser bootstrap, covered by Playwright E2E */
/* v8 ignore next -- browser bootstrap, covered by Playwright E2E */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('DOMContentLoaded', () => {
    try {
      wireLauncherButtons({});
    } catch (err) {
      console.error(`Renderer wiring failed: ${err.message}`);
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { wireLauncherButtons, BUTTON_ACTIONS, getApi };
}
