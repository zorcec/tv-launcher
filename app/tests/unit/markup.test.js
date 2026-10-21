'use strict';

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(here, '..', '..', 'src', 'renderer', 'index.html');

describe('renderer markup', () => {
  it('exists and contains four app tiles with test ids', () => {
    const html = fs.readFileSync(indexPath, 'utf8');
    for (const id of ['primevideo', 'gonet', 'youtube', 'steam']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`data-testid="app-${id}"`);
    }
    expect(html).toContain('data-testid="background-video"');
    expect(html).toContain('id="background-video"');
  });

  it('enforces CSP and secure script loading', () => {
    const html = fs.readFileSync(indexPath, 'utf8');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'self'");
    expect(html).toContain('renderer.js');
    expect(html).not.toContain('http://');
  });

  it('is accessible (roles, labels, main landmark)', () => {
    const html = fs.readFileSync(indexPath, 'utf8');
    expect(html).toContain('<main');
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-label="Open Prime Video"');
  });
});
