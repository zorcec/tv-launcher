# tv-launcher

Fullscreen Electron kiosk launcher for a TV box: button grid over a looping
background video. Prime Video / GoNet / YouTube open in kiosk Firefox,
Steam opens the Steam Link flatpak. Hyperion ambilight capture runs while the
app is alive and the TV is connected.

## Project structure (best-practice split)

```
app/
  src/
    main/        # Node / Electron main process (no UI)
      main.js        # composition root — wires everything, auto-boots only as Electron entry
      config.js      # single source of truth (apps, hosts, hyperion, window)
      window.js      # BrowserWindow factory (secure webPreferences, nav hardening)
      ipc.js         # IPC channels: launch-app (preferred), openUrl, exec (allowlisted)
      launcher.js    # allowlisted spawning via execFile (no shell), URL validation
      hyperion.js    # HyperionController (injectable, dry-run in tests)
      tv-monitor.js  # xrandr parsing + polling monitor
    preload/
      preload.js     # minimal contextBridge (openUrl/launchApp/exec + validation)
    renderer/
      index.html     # CSP, data-testid hooks, accessible tiles
      renderer.js    # data-driven button wiring (exported for unit tests)
      styles.css
  assets/          # icons + background video
  tests/
    unit/          # Vitest + Istanbul (fast, mocked, ~99% lines)
    e2e/           # Playwright Electron (real window, dry-run spawns)
  vitest.config.js
  playwright.config.js
```

Main-process modules never touch globals directly — `BrowserWindow`,
`ipcMain`, `execFile`, timers and env are injected, so unit tests pass fakes
and never spawn real processes.

Security: `nodeIntegration:false`, `contextIsolation:true`, strict CSP,
`execFile` (no shell), HTTPS + host allowlist for URLs, exact allowlist for
legacy `exec`, blocked popups / external navigation.

## Scripts

```sh
cd app
npm install

npm run test:unit        # Vitest + Istanbul coverage (thresholds: 90/85/90/90)
npm run test:unit:watch  # watch mode
npm run test:e2e         # Playwright: boots real Electron, clicks all tiles
npm start                # electron .
```

E2E runs with `TV_LAUNCHER_E2E=1` (set by the spec via Playwright `env`),
which puts launcher/hyperion in dry-run so no firefox/hyperion/xrandr
processes spawn on CI. On headless Linux CI, run under `xvfb-maybe`
(or `xvfb-run`) so Electron finds a display:

```sh
npx xvfb-maybe npm run test:e2e
```

## Coverage

- Unit (Istanbul): ~99% lines, ~93% branches, ~90% functions. Bootstrap-only
  code (Electron entry auto-boot, preload auto-wire) carries
  `istanbul ignore` and is covered by E2E instead.
- E2E (Playwright): window boots fullscreen with title, all five tiles +
  video render, clicking every tile keeps the app alive, screenshot smoke.
