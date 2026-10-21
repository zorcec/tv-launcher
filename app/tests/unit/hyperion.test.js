'use strict';

import { describe, it, expect, vi } from 'vitest';
import { HyperionController } from '../../src/main/hyperion.js';

function silentLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('HyperionController', () => {
  it('starts once and returns same child', () => {
    const log = silentLog();
    const fakeChild = { kill: vi.fn(), on: vi.fn() };
    const spawnFn = vi.fn((_c, _a, cb) => {
      cb(null, '', '');
      return fakeChild;
    });
    const h = new HyperionController({ spawnFn, spawnSyncFn: vi.fn(), log, env: {} });
    const first = h.start();
    const second = h.start();
    expect(first).toBe(fakeChild);
    expect(second).toBe(fakeChild);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(h.isRunning).toBe(true);
  });

  it('dry-run start does not spawn', () => {
    const spawnFn = vi.fn();
    const log = silentLog();
    const h = new HyperionController({ spawnFn, log, env: { NODE_ENV: 'test' } });
    const child = h.start();
    expect(child.dryRun).toBe(true);
    expect(spawnFn).not.toHaveBeenCalled();
    expect(h.isRunning).toBe(true);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('dry-run'), expect.anything());
  });

  it('logs stdout on successful spawn', () => {
    const log = silentLog();
    const h = new HyperionController({
      spawnFn: (_c, _a, cb) => {
        cb(null, 'hello', '');
        return { on: vi.fn() };
      },
      log,
      env: {},
    });
    h.start();
    expect(log.info).toHaveBeenCalledWith('stdout: hello');
  });

  it('logs spawn error and stderr', () => {
    const logErr = silentLog();
    const hErr = new HyperionController({
      spawnFn: (_c, _a, cb) => {
        cb(new Error('nope'), '', '');
        return { on: vi.fn() };
      },
      log: logErr,
      env: {},
    });
    hErr.start();
    expect(logErr.error).toHaveBeenCalledWith(expect.stringContaining('nope'));

    const logStderr = silentLog();
    const hStderr = new HyperionController({
      spawnFn: (_c, _a, cb) => {
        cb(null, '', 'warn-out');
        return { on: vi.fn() };
      },
      log: logStderr,
      env: {},
    });
    hStderr.start();
    expect(logStderr.error).toHaveBeenCalledWith('stderr: warn-out');
  });

  it('handles synchronous spawn throw', () => {
    const log = silentLog();
    const h = new HyperionController({
      spawnFn: () => {
        throw new Error('sync fail');
      },
      log,
      env: {},
    });
    expect(h.start()).toBeNull();
    expect(h.isRunning).toBe(false);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('sync fail'));
  });

  it('wires child error/exit handlers and clears on exit', () => {
    const handlers = {};
    const fakeChild = {
      kill: vi.fn(),
      on: vi.fn((ev, cb) => {
        handlers[ev] = cb;
      }),
    };
    const log = silentLog();
    const h2 = new HyperionController({
      spawnFn: (_c, _a, cb) => {
        cb(null, '', '');
        return fakeChild;
      },
      log,
      env: {},
    });
    h2.start();
    handlers.error(new Error('child blew up'));
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('child blew up'));
    handlers.exit();
    expect(h2.isRunning).toBe(false);
    // start again after exit works
    const again = h2.start();
    expect(again).toBe(fakeChild);
  });

  it('stop kills child and pkills async by default', () => {
    const kill = vi.fn();
    const calls = [];
    const spawnFn = vi.fn((cmd, args, cb) => {
      calls.push(cmd);
      if (cmd === 'hyperion-qt') {
        cb(null, '', '');
        return { kill, on: vi.fn() };
      }
      cb(null, '', '');
      return 'pkilled';
    });
    const log = silentLog();
    const h = new HyperionController({ spawnFn, log, env: {} });
    h.start();
    h.stop();
    expect(kill).toHaveBeenCalledWith('SIGINT');
    expect(spawnFn).toHaveBeenCalledWith('pkill', ['-f', 'hyperion'], expect.any(Function));
    expect(h.isRunning).toBe(false);
  });

  it('stop with block:true uses sync pkill', () => {
    const spawnSyncFn = vi.fn();
    const log = silentLog();
    const h = new HyperionController({
      spawnFn: () => ({ kill: vi.fn(), on: vi.fn() }),
      spawnSyncFn,
      log,
      env: {},
    });
    h.start();
    h.stop({ block: true });
    expect(spawnSyncFn).toHaveBeenCalledWith('pkill', ['-f', 'hyperion']);
  });

  it('stop handles kill throw and pkill throw', () => {
    const log = silentLog();
    const h = new HyperionController({
      spawnFn: () => ({
        kill: () => {
          throw new Error('kill fail');
        },
        on: vi.fn(),
      }),
      spawnSyncFn: () => {
        throw new Error('pkill fail');
      },
      log,
      env: {},
    });
    h.start();
    h.stop({ block: true });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('kill fail'));
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('pkill fail'));
    expect(h.isRunning).toBe(false);
  });

  it('stop logs async pkill error', () => {
    const log = silentLog();
    const h = new HyperionController({
      spawnFn: (cmd, args, cb) => {
        if (cmd === 'pkill') cb(new Error('pkill async fail'));
        return { kill: vi.fn(), on: vi.fn() };
      },
      log,
      env: {},
    });
    // start with a child that has no kill issues, then stop triggers pkill error path
    h._child = { kill: vi.fn() };
    h.stop();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('pkill async fail'));
  });

  it('stop in dry-run only logs', () => {
    const spawnFn = vi.fn();
    const log = silentLog();
    const h = new HyperionController({ spawnFn, log, env: { NODE_ENV: 'test' } });
    h.start();
    h.stop();
    expect(spawnFn).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('dry-run'));
  });

  it('stop with no child still pkills', () => {
    const spawnFn = vi.fn((_c, _a, cb) => {
      cb(null, '', '');
      return 'ok';
    });
    const h = new HyperionController({ spawnFn, log: silentLog(), env: {} });
    h.stop();
    expect(spawnFn).toHaveBeenCalledWith('pkill', expect.anything(), expect.any(Function));
  });

  it('exposes child getter and defaults', () => {
    const h = new HyperionController({ env: {} });
    expect(h.child).toBeNull();
    expect(h.isDryRun()).toBe(false);
    const hTest = new HyperionController({ env: { TV_LAUNCHER_E2E: '1' } });
    expect(hTest.isDryRun()).toBe(true);
    const hDriver = new HyperionController({ env: { APP_TEST_DRIVER: '1' } });
    expect(hDriver.isDryRun()).toBe(true);
    const hVitest = new HyperionController({ env: { VITEST: 'true' } });
    expect(hVitest.isDryRun()).toBe(true);
  });
});
