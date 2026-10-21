'use strict';

import { describe, it, expect } from 'vitest';
import { APPS, ALLOWED_HOSTS, HYPERION, TV, WINDOW, getAppById, FIREFOX_BINARY } from '../../src/main/config.js';

describe('config', () => {
  it('exposes four launcher apps with ids, kinds and labels', () => {
    expect(APPS).toHaveLength(4);
    const ids = APPS.map((a) => a.id).sort();
    expect(ids).toEqual(['gonet', 'primevideo', 'steam', 'youtube']);
    for (const app of APPS) {
      expect(app.id).toMatch(/^[a-z]+$/);
      expect(app.label.length).toBeGreaterThan(0);
      expect(['url', 'command']).toContain(app.kind);
      if (app.kind === 'url') expect(app.url.startsWith('https://')).toBe(true);
      if (app.kind === 'command') {
        expect(app.command.length).toBeGreaterThan(0);
        expect(Array.isArray(app.args)).toBe(true);
      }
    }
  });

  it('getAppById resolves known ids and returns null otherwise', () => {
    expect(getAppById('primevideo').url).toBe('https://www.primevideo.com');
    expect(getAppById('steam').command).toBe('flatpak');
    expect(getAppById('nope')).toBeNull();
    expect(getAppById('')).toBeNull();
    expect(getAppById(undefined)).toBeNull();
  });

  it('defines hyperion, tv and window defaults', () => {
    expect(HYPERION.command).toBe('hyperion-qt');
    expect(HYPERION.args).toEqual(['-f', '5', '-s', '4', '-a', '0.0.0.0:19401']);
    expect(HYPERION.pkillPattern).toBe('hyperion');
    expect(TV.connector).toBe('HDMI-1');
    expect(TV.pollIntervalMs).toBeGreaterThan(0);
    expect(WINDOW.fullscreen).toBe(true);
    expect(WINDOW.frame).toBe(false);
    expect(ALLOWED_HOSTS).toContain('youtube.com');
    expect(FIREFOX_BINARY.length).toBeGreaterThan(0);
  });
});
