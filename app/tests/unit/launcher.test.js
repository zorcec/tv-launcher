'use strict';

import { describe, it, expect, vi } from 'vitest';
import {
  isUrlAllowed,
  openUrl,
  runCommand,
  runLegacyCommandLine,
  launchAppById,
  LEGACY_EXEC_ALLOWLIST,
  isTestMode,
} from '../../src/main/launcher.js';

function silentLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('isTestMode', () => {
  it('detects test env flags', () => {
    expect(isTestMode({ NODE_ENV: 'test' })).toBe(true);
    expect(isTestMode({ VITEST: 'true' })).toBe(true);
    expect(isTestMode({ TV_LAUNCHER_E2E: '1' })).toBe(true);
    expect(isTestMode({ APP_TEST_DRIVER: '1' })).toBe(true);
    expect(isTestMode({ NODE_ENV: 'production' })).toBe(false);
    expect(isTestMode({})).toBe(false);
  });
});

describe('isUrlAllowed', () => {
  it('allows configured https hosts', () => {
    expect(isUrlAllowed('https://www.primevideo.com')).toBe(true);
    expect(isUrlAllowed('https://www.primevideo.com/storefront')).toBe(true);
    expect(isUrlAllowed('https://youtube.com')).toBe(true);
    expect(isUrlAllowed('https://www.youtube.com/watch?v=1')).toBe(true);
    expect(isUrlAllowed('https://www.gonet.tv/onlinetv/')).toBe(true);
  });

  it('allows subdomains of allowlisted hosts', () => {
    expect(isUrlAllowed('https://sub.youtube.com/')).toBe(true);
  });

  it('rejects non-https, unknown hosts and garbage', () => {
    expect(isUrlAllowed('http://youtube.com')).toBe(false);
    expect(isUrlAllowed('https://evil.com')).toBe(false);
    expect(isUrlAllowed('https://youtube.com.evil.com')).toBe(false);
    expect(isUrlAllowed('not a url')).toBe(false);
    expect(isUrlAllowed('')).toBe(false);
    expect(isUrlAllowed(null)).toBe(false);
    expect(isUrlAllowed(undefined)).toBe(false);
    expect(isUrlAllowed(123)).toBe(false);
    expect(isUrlAllowed('file:///etc/passwd')).toBe(false);
    expect(isUrlAllowed('javascript:alert(1)')).toBe(false);
    expect(isUrlAllowed('https://')).toBe(false);
    expect(isUrlAllowed('x'.repeat(3000))).toBe(false);
  });

  it('is case-insensitive on host', () => {
    expect(isUrlAllowed('https://YouTube.COM/')).toBe(true);
  });
});

describe('openUrl', () => {
  it('dry-run does not spawn and returns descriptor', () => {
    const execFile = vi.fn();
    const log = silentLog();
    const res = openUrl('https://youtube.com', { execFile, log, dryRun: true });
    expect(res).toEqual({ dryRun: true, url: 'https://youtube.com' });
    expect(execFile).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalled();
  });

  it('throws for non-allowlisted url', () => {
    expect(() => openUrl('https://evil.com', { dryRun: true })).toThrow(/allowlisted/i);
    expect(() => openUrl('http://youtube.com', { dryRun: true })).toThrow();
  });

  it('spawns flatpak firefox and logs stdout', () => {
    const log = silentLog();
    const child = { pid: 1 };
    const execFile = vi.fn((cmd, args, cb) => {
      expect(cmd).toBe('flatpak');
      expect(args).toContain('--kiosk');
      expect(args).toContain('https://youtube.com');
      cb(null, 'ok-out', '');
      return child;
    });
    const res = openUrl('https://youtube.com', { execFile, log, dryRun: false });
    expect(res).toBe(child);
    expect(log.info).toHaveBeenCalledWith('open url:', 'https://youtube.com');
    expect(log.info).toHaveBeenCalledWith('stdout: ok-out');
  });

  it('logs exec error from flatpak wrapper', () => {
    const log = silentLog();
    const execFile = vi.fn((_c, _a, cb) => {
      cb(new Error('boom'), '', '');
      return {};
    });
    openUrl('https://youtube.com', { execFile, log, dryRun: false });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('logs stderr from flatpak wrapper', () => {
    const log = silentLog();
    const execFile = vi.fn((_c, _a, cb) => {
      cb(null, '', 'some-stderr');
      return {};
    });
    openUrl('https://youtube.com', { execFile, log, dryRun: false });
    expect(log.error).toHaveBeenCalledWith('stderr: some-stderr');
  });

  it('falls back to native firefox on ENOENT', () => {
    const log = silentLog();
    const calls = [];
    const execFile = vi.fn((cmd, args, cb) => {
      calls.push(cmd);
      if (cmd === 'flatpak') {
        const err = new Error('spawn ENOENT');
        err.code = 'ENOENT';
        cb(err, '', '');
      } else {
        cb(null, '', '');
      }
      return {};
    });
    openUrl('https://youtube.com', { execFile, log, dryRun: false });
    expect(calls).toEqual(['flatpak', 'firefox']);
  });

  it('falls back to native when flatpak spawn throws synchronously', () => {
    const log = silentLog();
    const execFile = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('sync boom');
      })
      .mockImplementation((_c, _a, cb) => {
        cb(null, '', '');
        return {};
      });
    openUrl('https://youtube.com', { execFile, log, dryRun: false });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('sync boom'));
    expect(execFile).toHaveBeenCalledTimes(2);
  });
});

describe('runCommand', () => {
  it('validates inputs', () => {
    expect(() => runCommand('', [], { dryRun: true })).toThrow(/Invalid command/);
    expect(() => runCommand(null, [], { dryRun: true })).toThrow();
    expect(() => runCommand('flatpak', 'nope', { dryRun: true })).toThrow(/Invalid args/);
    expect(() => runCommand('flatpak', [123], { dryRun: true })).toThrow(/Invalid args/);
  });

  it('dry-run returns descriptor without spawning', () => {
    const execFile = vi.fn();
    const log = silentLog();
    expect(runCommand('flatpak', ['run', 'x'], { execFile, log, dryRun: true })).toEqual({
      dryRun: true,
      command: 'flatpak',
      args: ['run', 'x'],
    });
    expect(execFile).not.toHaveBeenCalled();
  });

  it('spawns and handles stdout / error / stderr', () => {
    const logOk = silentLog();
    const execOk = vi.fn((_c, _a, cb) => {
      cb(null, 'out', '');
      return { pid: 7 };
    });
    const child = runCommand('flatpak', ['run', 'x'], { execFile: execOk, log: logOk, dryRun: false });
    expect(child.pid).toBe(7);
    expect(logOk.info).toHaveBeenCalledWith('exec:', 'flatpak run x');
    expect(logOk.info).toHaveBeenCalledWith('stdout: out');

    const logErr = silentLog();
    runCommand('flatpak', ['run', 'x'], {
      execFile: (c, a, cb) => cb(new Error('fail'), '', ''),
      log: logErr,
      dryRun: false,
    });
    expect(logErr.error).toHaveBeenCalledWith(expect.stringContaining('fail'));

    const logStderr = silentLog();
    runCommand('flatpak', ['run', 'x'], {
      execFile: (c, a, cb) => cb(null, '', 'warn'),
      log: logStderr,
      dryRun: false,
    });
    expect(logStderr.error).toHaveBeenCalledWith('stderr: warn');
  });
});

describe('runLegacyCommandLine', () => {
  it('runs exact allowlisted command', () => {
    const execFile = vi.fn((_c, _a, cb) => {
      cb(null, '', '');
      return {};
    });
    const log = silentLog();
    runLegacyCommandLine(LEGACY_EXEC_ALLOWLIST[0], { execFile, log, dryRun: false });
    expect(execFile).toHaveBeenCalledWith('flatpak', ['run', 'com.valvesoftware.SteamLink'], expect.any(Function));
  });

  it('rejects anything else', () => {
    expect(() => runLegacyCommandLine('rm -rf /', { dryRun: true })).toThrow(/allowlisted/i);
    expect(() => runLegacyCommandLine('flatpak run com.valvesoftware.SteamLink --extra', { dryRun: true })).toThrow();
    expect(() => runLegacyCommandLine('', { dryRun: true })).toThrow();
    expect(() => runLegacyCommandLine(null, { dryRun: true })).toThrow();
  });

  it('trims whitespace before matching', () => {
    const execFile = vi.fn((_c, _a, cb) => {
      cb(null, '', '');
      return {};
    });
    runLegacyCommandLine(`  ${LEGACY_EXEC_ALLOWLIST[0]}  `, { execFile, log: silentLog(), dryRun: false });
    expect(execFile).toHaveBeenCalled();
  });
});

describe('launchAppById', () => {
  it('launches url apps via openUrl and command apps via runCommand', () => {
    const execFile = vi.fn((_c, _a, cb) => {
      cb(null, '', '');
      return { pid: 1 };
    });
    const log = silentLog();
    launchAppById('youtube', { execFile, log, dryRun: false });
    expect(execFile).toHaveBeenCalledWith('flatpak', expect.arrayContaining(['https://youtube.com']), expect.any(Function));

    const execFile2 = vi.fn((_c, _a, cb) => {
      cb(null, '', '');
      return { pid: 2 };
    });
    launchAppById('steam', { execFile: execFile2, log, dryRun: false });
    expect(execFile2).toHaveBeenCalledWith('flatpak', ['run', 'com.valvesoftware.SteamLink'], expect.any(Function));
  });

  it('throws UNKNOWN_APP for bad ids', () => {
    try {
      launchAppById('nope', { dryRun: true });
      expect.unreachable();
    } catch (err) {
      expect(err.code).toBe('UNKNOWN_APP');
    }
  });
});
