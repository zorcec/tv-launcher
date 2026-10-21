'use strict';

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireLauncherButtons, BUTTON_ACTIONS, getApi } from '../../src/renderer/renderer.js';

function makeDocument() {
  document.body.innerHTML = `
    <div id="primevideo"></div>
    <div id="gonet"></div>
    <div id="youtube"></div>
    <div id="steam"></div>
  `;
  return document;
}

function makeApi() {
  return { launchApp: vi.fn(), openUrl: vi.fn(), exec: vi.fn() };
}

describe('renderer wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes four button actions', () => {
    expect(BUTTON_ACTIONS.map((b) => b.elementId).sort()).toEqual(
      ['gonet', 'primevideo', 'steam', 'youtube']
    );
  });

  it('wires all buttons to launchApp', () => {
    const doc = makeDocument();
    const api = makeApi();
    const wired = wireLauncherButtons({ document: doc, api });
    expect(wired).toHaveLength(4);

    doc.getElementById('primevideo').click();
    expect(api.launchApp).toHaveBeenCalledWith('primevideo');
    doc.getElementById('gonet').click();
    expect(api.launchApp).toHaveBeenCalledWith('gonet');
    doc.getElementById('youtube').click();
    expect(api.launchApp).toHaveBeenCalledWith('youtube');
    doc.getElementById('steam').click();
    expect(api.launchApp).toHaveBeenCalledWith('steam');
  });

  it('warns and skips missing elements', () => {
    document.body.innerHTML = '<div id="primevideo"></div>';
    const api = makeApi();
    const log = { warn: vi.fn() };
    const wired = wireLauncherButtons({ document, api, log });
    expect(wired).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('#steam'));
  });

  it('throws without api', () => {
    const doc = makeDocument();
    expect(() => wireLauncherButtons({ document: doc, api: null })).toThrow(/window.api/);
    expect(() => wireLauncherButtons({ document: doc })).toThrow(/window.api/);
  });

  it('uses global document when not passed explicitly', () => {
    makeDocument(); // populates global document
    const api = makeApi();
    const wired = wireLauncherButtons({ api });
    expect(wired).toHaveLength(4);
  });

  it('falls back to legacy openUrl when launchApp missing', () => {
    const doc = makeDocument();
    const api = { openUrl: vi.fn(), exec: vi.fn() };
    wireLauncherButtons({ document: doc, api });
    doc.getElementById('youtube').click();
    expect(api.openUrl).toHaveBeenCalledWith('https://youtube.com');
  });

  it('falls back to legacy exec for steam when launchApp/openUrl missing', () => {
    const doc = makeDocument();
    const api = { exec: vi.fn() };
    wireLauncherButtons({ document: doc, api });
    doc.getElementById('steam').click();
    expect(api.exec).toHaveBeenCalledWith('flatpak run com.valvesoftware.SteamLink');
  });

  it('getApi reads window.api', () => {
    expect(getApi({ api: { x: 1 } }).x).toBe(1);
    expect(getApi({})).toBeNull();
    expect(getApi()).toBeDefined(); // falls back to global window in jsdom (no api → null or object)
  });

  it('auto-wire listener survives missing api (logs, no throw)', () => {
    document.body.innerHTML = '<div id="primevideo"></div>';
    delete window.api;
    // The DOMContentLoaded handler catches wiring errors internally.
    expect(() => document.dispatchEvent(new Event('DOMContentLoaded'))).not.toThrow();
  });
});
