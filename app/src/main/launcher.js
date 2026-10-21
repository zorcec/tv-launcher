'use strict';

const { execFile, execFileSync } = require('node:child_process');
const { ALLOWED_HOSTS, FIREFOX_BINARY, FIREFOX_FLATPAK_ARGS, FIREFOX_BINARY_FALLBACK, getAppById } = require('./config');

function defaultLog() {
  return {
    info: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
  };
}

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test' || env.VITEST === 'true' || env.TV_LAUNCHER_E2E === '1' || env.APP_TEST_DRIVER === '1';
}

/**
 * Returns true when the URL is an https URL on an allowlisted host
 * (or any https host when allowlist is empty — not the case here).
 */
function isUrlAllowed(rawUrl, allowedHosts = ALLOWED_HOSTS) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith(`.${a}`);
  });
}

/**
 * Open a URL in kiosk Firefox without invoking a shell (no injection).
 *
 * @param {string} url
 * @param {object} deps { execFile, env, log, dryRun }
 */
function openUrl(url, deps = {}) {
  const { execFile: execFileFn = execFile, env = process.env, log = defaultLog(), dryRun = isTestMode(env) } = deps;

  if (!isUrlAllowed(url)) {
    const err = new Error(`Blocked opening non-allowlisted URL: ${String(url)}`);
    err.code = 'URL_NOT_ALLOWED';
    throw err;
  }

  // Prefer flatpak Firefox (this box runs Firefox as flatpak), fall back to
  // native binary. We probe quickly; on failure we still try the fallback.
  // In dry-run / test mode we do not spawn anything.
  if (dryRun) {
    log.info('[launcher:dry-run] openUrl', url);
    return { dryRun: true, url };
  }

  const tryNative = () => {
    log.info('open url:', url);
    execFileFn(FIREFOX_BINARY_FALLBACK, ['--kiosk', url], (error, stdout, stderr) => {
      if (error) {
        log.error(`Error executing command: ${error.message}`);
        return;
      }
      if (stderr) {
        log.error(`stderr: ${stderr}`);
        return;
      }
      if (stdout) log.info(`stdout: ${stdout}`);
    });
  };

  // Best-effort: use flatpak wrapper; fall back to native firefox.
  // We intentionally do not shell out, so `url` can never inject commands.
  log.info('open url:', url);
  try {
    const child = execFileFn(
      FIREFOX_BINARY,
      [...FIREFOX_FLATPAK_ARGS, '--kiosk', url],
      (error, stdout, stderr) => {
        if (error) {
          // Flatpak wrapper missing (e.g. dev machine) → try native binary.
          if (error.code === 'ENOENT') {
            tryNative();
            return;
          }
          log.error(`Error executing command: ${error.message}`);
          return;
        }
        if (stderr) {
          log.error(`stderr: ${stderr}`);
          return;
        }
        if (stdout) log.info(`stdout: ${stdout}`);
      }
    );
    return child;
  } catch (err) {
    log.error(`Error executing command: ${err.message}`);
    tryNative();
    return undefined;
  }
}

/**
 * Run an allowlisted desktop command (e.g. Steam Link) without a shell.
 *
 * @param {string} command binary name
 * @param {string[]} args
 * @param {object} deps
 */
function runCommand(command, args = [], deps = {}) {
  const { execFile: execFileFn = execFile, env = process.env, log = defaultLog(), dryRun = isTestMode(env) } = deps;

  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('Invalid command');
  }
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    throw new Error('Invalid args');
  }

  if (dryRun) {
    log.info('[launcher:dry-run] exec', command, args.join(' '));
    return { dryRun: true, command, args };
  }

  log.info('exec:', `${command} ${args.join(' ')}`);
  return execFileFn(command, args, (error, stdout, stderr) => {
    if (error) {
      log.error(`Error executing command: ${error.message}`);
      return;
    }
    if (stderr) {
      log.error(`stderr: ${stderr}`);
      return;
    }
    if (stdout) log.info(`stdout: ${stdout}`);
  });
}

/** Legacy allowlist for the deprecated generic `exec` channel. */
const LEGACY_EXEC_ALLOWLIST = ['flatpak run com.valvesoftware.SteamLink'];

/**
 * Back-compat handler for renderer `api.exec(cmdString)`.
 * Only exact allowlisted command lines are accepted.
 */
function runLegacyCommandLine(cmdLine, deps = {}) {
  if (typeof cmdLine !== 'string' || !LEGACY_EXEC_ALLOWLIST.includes(cmdLine.trim())) {
    const err = new Error(`Blocked non-allowlisted command: ${String(cmdLine)}`);
    err.code = 'COMMAND_NOT_ALLOWED';
    throw err;
  }
  const [command, ...args] = cmdLine.trim().split(/\s+/);
  return runCommand(command, args, deps);
}

/**
 * Launch a configured app by id (`primevideo`, `steam`, …).
 */
function launchAppById(id, deps = {}) {
  const app = getAppById(id);
  if (!app) {
    const err = new Error(`Unknown app id: ${String(id)}`);
    err.code = 'UNKNOWN_APP';
    throw err;
  }
  if (app.kind === 'url') return openUrl(app.url, deps);
  return runCommand(app.command, app.args, deps);
}

module.exports = {
  isUrlAllowed,
  openUrl,
  runCommand,
  runLegacyCommandLine,
  launchAppById,
  LEGACY_EXEC_ALLOWLIST,
  isTestMode,
};
