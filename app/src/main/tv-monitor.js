'use strict';

const { execFile } = require('node:child_process');
const { TV } = require('./config');

/**
 * Parse `xrandr` output for a connected connector.
 * Uses a strict regex so `disconnected` never matches `connected`.
 *
 * @param {string} output stdout of `xrandr`
 * @param {string} connector e.g. `HDMI-1`
 */
function parseXrandrConnected(output, connector = TV.connector) {
  if (typeof output !== 'string') return false;
  const escaped = connector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s+connected\\b`, 'm');
  return re.test(output);
}

/**
 * Polls `xrandr` and toggles Hyperion when the TV appears/disappears.
 */
class TvMonitor {
  /**
   * @param {object} deps
   * @param {object} deps.hyperion HyperionController-like {start, stop}
   * @param {(cb:Function)=>void} deps.execXrandr defaults to execFile('xrandr')
   * @param {number} deps.pollIntervalMs
   * @param {string} deps.connector
   * @param {object} deps.log
   */
  constructor(deps = {}) {
    this._hyperion = deps.hyperion || null;
    this._execXrandr =
      deps.execXrandr ||
      ((cb) => execFile('xrandr', [], (error, stdout, stderr) => cb(error, stdout, stderr)));
    this._pollIntervalMs = deps.pollIntervalMs ?? TV.pollIntervalMs;
    this._connector = deps.connector || TV.connector;
    this._log = deps.log || { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };
    this._timer = null;
    this._lastState = null;
  }

  get isWatching() {
    return this._timer !== null;
  }

  get lastState() {
    return this._lastState;
  }

  /** Run a single poll; invokes hyperion start/stop on change. Calls back with (err, isConnected). */
  checkOnce(callback) {
    this._execXrandr((error, stdout) => {
      if (error) {
        this._log.error(`Error executing command: ${error.message}`);
        if (typeof callback === 'function') callback(error, this._lastState);
        return;
      }
      const connected = parseXrandrConnected(String(stdout || ''), this._connector);
      this._log.info('Tv detected', connected);
      const changed = this._lastState !== connected;
      this._lastState = connected;
      if (changed && this._hyperion) {
        if (connected) this._hyperion.start();
        else this._hyperion.stop();
      }
      if (typeof callback === 'function') callback(null, connected);
    });
  }

  start() {
    if (this._timer) return this._timer;
    this.checkOnce();
    this._timer = setInterval(() => this.checkOnce(), this._pollIntervalMs);
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref();
    return this._timer;
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { parseXrandrConnected, TvMonitor };
