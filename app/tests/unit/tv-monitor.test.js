'use strict';

import { describe, it, expect, vi } from 'vitest';
import { parseXrandrConnected, TvMonitor } from '../../src/main/tv-monitor.js';

function silentLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('parseXrandrConnected', () => {
  it('detects connected output', () => {
    expect(parseXrandrConnected('HDMI-1 connected primary 3840x2160+0+0')).toBe(true);
    expect(parseXrandrConnected('Screen 0:\nHDMI-1 connected\nDP-1 disconnected')).toBe(true);
  });

  it('rejects disconnected and unrelated output', () => {
    expect(parseXrandrConnected('HDMI-1 disconnected (normal)')).toBe(false);
    expect(parseXrandrConnected('DP-1 connected')).toBe(false);
    expect(parseXrandrConnected('')).toBe(false);
    expect(parseXrandrConnected(null)).toBe(false);
    expect(parseXrandrConnected(undefined)).toBe(false);
    expect(parseXrandrConnected(123)).toBe(false);
  });

  it('respects custom connector and escapes regex chars', () => {
    expect(parseXrandrConnected('DP-1 connected', 'DP-1')).toBe(true);
    expect(parseXrandrConnected('DP-1 connected', 'HDMI-1')).toBe(false);
    expect(parseXrandrConnected('HDMI.1 connected', 'HDMI.1')).toBe(true);
    expect(parseXrandrConnected('HDMIx1 connected', 'HDMI.1')).toBe(false);
  });
});

describe('TvMonitor', () => {
  it('starts hyperion on connect and stops on disconnect', () => {
    const hyperion = { start: vi.fn(), stop: vi.fn() };
    const log = silentLog();
    let current = 'HDMI-1 connected';
    const monitor = new TvMonitor({
      hyperion,
      execXrandr: (cb) => cb(null, current),
      pollIntervalMs: 10000,
      log,
    });
    monitor.checkOnce();
    expect(hyperion.start).toHaveBeenCalledTimes(1);
    expect(monitor.lastState).toBe(true);

    // same state → no duplicate toggle
    monitor.checkOnce();
    expect(hyperion.start).toHaveBeenCalledTimes(1);

    current = 'HDMI-1 disconnected';
    monitor.checkOnce();
    expect(hyperion.stop).toHaveBeenCalledTimes(1);
    expect(monitor.lastState).toBe(false);
  });

  it('reports errors and forwards callback args', () => {
    const log = silentLog();
    const monitor = new TvMonitor({
      hyperion: null,
      execXrandr: (cb) => cb(new Error('xrandr missing'), ''),
      log,
    });
    const cb = vi.fn();
    monitor.checkOnce(cb);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('xrandr missing'));
    expect(cb).toHaveBeenCalledWith(expect.any(Error), null);
  });

  it('invokes success callback with state', () => {
    const monitor = new TvMonitor({
      hyperion: null,
      execXrandr: (cb) => cb(null, 'HDMI-1 connected'),
      log: silentLog(),
    });
    const cb = vi.fn();
    monitor.checkOnce(cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('works without hyperion (no toggle)', () => {
    const monitor = new TvMonitor({
      execXrandr: (cb) => cb(null, 'HDMI-1 connected'),
      log: silentLog(),
    });
    expect(() => monitor.checkOnce()).not.toThrow();
    expect(monitor.lastState).toBe(true);
  });

  it('start() polls once immediately and stop() clears timer', () => {
    vi.useFakeTimers();
    try {
      const hyperion = { start: vi.fn(), stop: vi.fn() };
      const monitor = new TvMonitor({
        hyperion,
        execXrandr: (cb) => cb(null, 'HDMI-1 connected'),
        pollIntervalMs: 1000,
        log: silentLog(),
      });
      const t1 = monitor.start();
      expect(hyperion.start).toHaveBeenCalledTimes(1);
      const t2 = monitor.start();
      expect(t2).toBe(t1);
      expect(monitor.isWatching).toBe(true);
      vi.advanceTimersByTime(1000);
      // second poll same state → no extra start
      expect(hyperion.start).toHaveBeenCalledTimes(1);
      monitor.stop();
      expect(monitor.isWatching).toBe(false);
      monitor.stop(); // idempotent
    } finally {
      vi.useRealTimers();
    }
  });
});
