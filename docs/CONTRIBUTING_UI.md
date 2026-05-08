# Contributing UI slices

## Slice scope

Each slice covers 1-2 days of focused work. A sub-agent dispatch handles the implementation, a codex review provides a second pair of eyes, and a single PR lands the result. No slice mixes UI changes with engine changes unless the engine prerequisite ships in the same PR by agreement.

## Acceptance criteria template

Before merging any UI slice, verify each item:

- [ ] `npx tsc --noEmit` exits clean
- [ ] `MWF_HAS_GIT=1 npm test` is green with count ≥ 857
- [ ] `npm run test:e2e` is green (all specs pass, no flakes on re-run)
- [ ] Screenshot baselines for the slice are committed under `e2e/<slice>.spec.ts-snapshots/`
- [ ] Codex review reports CLEAN
- [ ] Manual phone smoke: load the app on an actual mobile browser, verify the changed surface

## How to invoke Playwright from a sub-agent

Install the browser once per machine:

```
npm run test:e2e:install
```

Run all E2E specs:

```
npm run test:e2e
```

Update screenshot baselines after intentional UI changes:

```
npx playwright test --update-snapshots
```

Debug with the interactive UI:

```
npm run test:e2e:ui
```

## Screenshots and artifacts

Per-slice snapshots go under `e2e/<slice>.spec.ts-snapshots/` — Playwright's default location. Commit the chromium baseline alongside the spec that generates it.

Test artifacts (videos, traces, full-page captures from acceptance runs) land in `test-results/`. That directory is gitignored; CI uploads it as a `playwright-report` artifact with 7-day retention. Reference the CI artifact when reviewing a failing E2E run remotely.

To organize acceptance artifacts by slice, use `test-results/ui-N/` as the output directory convention when running manual acceptance passes.

## Service worker dual-mode

All specs run with `serviceWorkers: 'block'` by default. This keeps tests deterministic: the SW never intercepts API responses the spec mocks via `page.route`. UI-2 adds a dedicated SW spec that opts in per-test:

```ts
test.use({ serviceWorkers: "allow" });
```

Do not change the project-level default — it protects all other specs from SW interference.

## Service worker test mode

### Opting in per spec

Add `test.use({ serviceWorkers: "allow" })` at the top of any spec file that needs the SW active. The declaration applies to every test in that file.

```ts
import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "allow" });
```

Do not add this to individual `test()` calls — the setting is file-scoped. If only a subset of tests in a file needs SW, split them into a separate file.

### Why the project default blocks the SW

`playwright.config.ts` sets `serviceWorkers: 'block'` globally so that `page.route(...)` mocks are never shadowed by a cached SW response. Without the block, a SW serving a stale cached response would silently break any spec that mocks network calls — the mock never fires and the test gets stale data.

Specs in `e2e/ui-2.spec.ts` opt in because they specifically exercise SW behavior (cache-first hashed assets, offline fallback, pass-through routes, `notification:navigate` postMessage). All other specs leave the default in place.

### Updating the SW between tests

The SW cache key is `CACHE_VERSION` in `pwa/sw.js`. When you change cache behavior, bump the constant (e.g., `v2-2026-05-08` → `v2-2026-05-09`). The `activate` handler clears all caches that do not match the current key, so the new SW takes over cleanly on next load.

During local development, use `pwa/clear-cache.html` to wipe all caches, unregister the SW, and clear localStorage in one click. Navigate there directly: `http://localhost:3000/clear-cache.html`.

In tests, call `context.clearCookies()` and `page.evaluate(() => caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))))` if you need a clean cache state between tests in the same context. Prefer separate browser contexts (each test gets a fresh one by default) to avoid cross-test SW state.

## Playwright + the engine

The `webServer` in `playwright.config.ts` starts the engine with:

```
MWF_DB_PATH=./.e2e-db.sqlite MWF_PWA_DIR=pwa MWF_AUTOMATION_SCAN_MS=0 npm start
```

The engine serves the PWA from `pwa/` on `http://localhost:3000`. Mock API responses with `page.route` so specs do not depend on engine state:

```ts
await page.route("**/workflows*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
);
```

Tests that need real database state are explicit opt-in: they must set up fixtures via the engine's HTTP API and clean up after themselves. The default `.e2e-db.sqlite` file is gitignored and regenerated on each run.

## iOS push caveat

Push notification specs require a browser with `PushManager` support and a valid VAPID key pair. Linux CI has neither a real device nor Safari. Push specs carry a `test.skip(process.env.CI === "true", "push requires real device")` guard. Manual phone smoke is the only verification path for push behavior.

## Test hooks

Shell components (Sheet, StatusDot, AppHeader, BottomTabs, ThemeToggle) are available to Playwright specs via `window.__ui`, a registry populated at runtime when the page URL includes `?test=1`.

**Activation:** navigate to `/?test=1`. The engine serves this URL the same as `/` — no special route needed.

**Available factories:**

| Key | Signature | Returns |
|-----|-----------|---------|
| `createSheet` | `(opts: {title, body, side?})` | `{open, close, destroy, panel, overlay}` |
| `createStatusDot` | `(status, {busy?, size?})` | `HTMLElement` (a `<span>`) |
| `createAppHeader` | `({title, statusBadgeNode?, rightSlot?})` | `HTMLElement` (a `<header>`) |
| `createBottomTabs` | `(tabs, activeId)` | `HTMLElement` (a `<nav>`) |
| `createThemeToggle` | `()` | `HTMLElement` (a `<div.theme-toggle>`) |

**Usage in a spec:**

```ts
const result = await page.evaluate(() => {
  const sheet = window.__ui.createSheet({ title: 'Test', body: 'Content' });
  return { visible: sheet.panel.classList.contains('open') };
});
expect(result.visible).toBe(true);
```

The registry is defined in `pwa/assets/test-hooks.js` and loaded as a `<script type="module">` in `index.html`. It has no effect when `?test=1` is absent — the `window.__ui` property is not set.
