'use strict';

const { execFile, execFileSync } = require('node:child_process');
const { HYPERION } = require('./config');

/**
 * Manages the `hyperion-qt` screen-capture process.
 *
 * Injectable `spawnFn` / `killFn` keep this unit-testable without
 * touching real processes.
 */
class HyperionController {
  /**
   * @param {object} deps
   * @param {(cmd:string,args:string[],cb:Function)=>any} deps.spawnFn
   * @param {(cmd:string,args:string[])=>any} deps.spawnSyncFn
   * @param {object} deps.log {info, error}
   * @param {string} deps.command
   * @param {string[]} deps.args
   * @param {string} deps.pkillPattern
   * @param {NodeJS.ProcessEnv} deps.env
   */
  constructor(deps = {}) {
    this._spawnFn =
      deps.spawnFn ||
      ((cmd, args, cb) =>
        execFile(cmd, args, (error, stdout, stderr) => cb && cb(error, stdout, stderr)));
    this._spawnSyncFn = deps.spawnSyncFn || ((cmd, args) => execFileSync(cmd, args, { stdio: 'ignore' }));
    this._log = deps.log || { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };
    this._command = deps.command || HYPERION.command;
    this._args = deps.args || HYPERION.args;
    this._pkillPattern = deps.pkillPattern || HYPERION.pkillPattern;
    this._env = deps.env || process.env;
    this._child = null;
  }

  get isRunning() {
    return this._child !== null;
  }

  get child() {
    return this._child;
  }

  isDryRun() {
    const env = this._env || {};
    return env.NODE_ENV === 'test' || env.VITEST === 'true' || env.TV_LAUNCHER_E2E === '1' || env.APP_TEST_DRIVER === '1';
  }

  start() {
    if (this._child) return this._child;
    if (this.isDryRun()) {
      this._log.info('[hyperion:dry-run] start', `${this._command} ${this._args.join(' ')}`);
      this._child = { dryRun: true, kill: () => {} };
      return this._child;
    }
    try {
      const child = this._spawnFn(this._command, this._args, (error, stdout, stderr) => {
        if (error) {
          // ENOENT = hyperion not installed on dev machines; don't crash.
          this._log.error(`Error executing command: ${error.message}`);
          return;
        }
        if (stderr) {
          this._log.error(`stderr: ${stderr}`);
          return;
        }
        if (stdout) this._log.info(`stdout: ${stdout}`);
      });
      this._child = child || { kill: () => {} };
      if (this._child && typeof this._child.on === 'function') {
        this._child.on('error', (err) => this._log.error(`Error executing command: ${err.message}`));
        this._child.on('exit', () => {
          this._child = null;
        });
      }
    } catch (err) {
      this._log.error(`Error executing command: ${err.message}`);
      this._child = null;
    }
    return this._child;
  }

  /**
   * @param {object} opts { block: boolean } — block=true uses a sync pkill
   * so process `exit` handlers can reliably clean up.
   */
  stop(opts = {}) {
    const { block = false } = opts;
    if (this._child && typeof this._child.kill === 'function') {
      try {
        this._child.kill('SIGINT');
      } catch (err) {
        this._log.error(`Error executing command: ${err.message}`);
      }
    }
    this._child = null;

    if (this.isDryRun()) {
      this._log.info('[hyperion:dry-run] stop');
      return;
    }

    try {
      if (block) {
        this._spawnSyncFn('pkill', ['-f', this._pkillPattern]);
      } else {
        this._spawnFn('pkill', ['-f', this._pkillPattern], (error) => {
          if (error) this._log.error(`Error executing command: ${error.message}`);
        });
      }
    } catch (err) {
      this._log.error(`Error executing command: ${err.message}`);
    }
  }
}

module.exports = { HyperionController };
