'use strict';

/**
 * Single source of truth for the TV launcher.
 *
 * Keeping all environment-specific values here makes the main process
 * modules pure and easily testable (no magic strings scattered around).
 */

const APPS = [
  { id: 'primevideo', kind: 'url', url: 'https://www.primevideo.com', label: 'Prime Video' },
  { id: 'gonet', kind: 'url', url: 'https://www.gonet.tv/onlinetv/', label: 'GoNet TV' },
  { id: 'youtube', kind: 'url', url: 'https://youtube.com', label: 'YouTube' },
  {
    id: 'steam',
    kind: 'command',
    command: 'flatpak',
    args: ['run', 'com.valvesoftware.SteamLink'],
    label: 'Steam Link',
  },
];

/** Hosts the launcher is allowed to open in kiosk Firefox. */
const ALLOWED_HOSTS = ['primevideo.com', 'www.primevideo.com', 'amazon.com', 'www.amazon.com', 'www.gonet.tv', 'gonet.tv', 'youtube.com', 'www.youtube.com', 'youtu.be'];

const FIREFOX_BINARY = 'flatpak';
const FIREFOX_FLATPAK_ARGS = ['run', 'org.mozilla.firefox'];

/** Legacy direct binary (used when flatpak wrapper is unavailable). */
const FIREFOX_BINARY_FALLBACK = 'firefox';

const HYPERION = {
  command: 'hyperion-qt',
  args: ['-f', '5', '-s', '4', '-a', '0.0.0.0:19401'],
  pkillPattern: 'hyperion',
};

const TV = {
  /** xrandr connector name for the TV. */
  connector: 'HDMI-1',
  /** How often to poll xrandr (disabled by default, see main.js). */
  pollIntervalMs: 5000,
  autoStart: false,
};

const WINDOW = {
  fullscreen: true,
  frame: false,
  autoHideMenuBar: true,
  backgroundColor: '#000000',
  title: 'TV Launcher',
};

function getAppById(id) {
  return APPS.find((a) => a.id === id) || null;
}

module.exports = {
  APPS,
  ALLOWED_HOSTS,
  FIREFOX_BINARY,
  FIREFOX_FLATPAK_ARGS,
  FIREFOX_BINARY_FALLBACK,
  HYPERION,
  TV,
  WINDOW,
  getAppById,
};
