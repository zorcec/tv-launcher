import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    globals: false,
    coverage: {
      // Istanbul instruments CJS `require` modules more accurately than V8
      // for this codebase (V8 undercounts shared CJS/ESM instances).
      // Bootstrap-only code (Electron entry, preload auto-wire) is excluded
      // via `istanbul ignore` comments and covered by Playwright E2E instead.
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: ['src/renderer/index.html', 'tests/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
