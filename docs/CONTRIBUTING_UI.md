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

## Phase containers

### The display:none / no-unmount invariant

`WorkspaceShell` (`pwa/assets/views/workspace-shell.js`) renders all seven phase containers as children of the shell element at mount time. Phase switching is done exclusively by toggling `element.style.display`:

- The active phase container has `display` cleared (reverts to its CSS value, which defaults to `block`).
- All other phase containers have `display: "none"`.

Hidden containers stay in the DOM. They are never removed, replaced, or re-created on phase transitions. This is the **no-unmount invariant**.

The load-bearing consequence: the transcript scroller (`<div class="transcript">`) and the composer element are long-lived DOM nodes. They are re-parented (moved between phase containers) when the active phase changes, but are never discarded. SSE handlers that append to the transcript scroller continue to work regardless of which phase is active, because the scroller stays in the tree.

### Why this matters

Without the invariant, each phase switch would tear down and recreate the transcript scroller. Any SSE messages that arrived during an intermediate phase (e.g., progress) would be lost. Scroll position would reset. LocalStorage drafts would survive (they are in storage, not DOM), but the textarea's in-memory cursor and selection would not.

### Adding a new phase

1. Add a row to the `PHASE_MAP` constant in `workspace-shell.js` mapping the new `executionStatus` to a new phase id.
2. Add the phase id to the `phases` object initializer — call a `buildPhaseXxx()` factory function that returns the root element for that phase.
3. Add the phase to the `ALL_PHASES` array in `e2e/ui-3.spec.ts` so the "all containers stay in DOM" assertion covers it.
4. If the phase should host the transcript scroller or composer, add a branch in `placeTranscriptScroller` and `placeComposer`.
5. If the phase needs composer-mode logic, add a branch in `deriveComposerMode`.

Do not use `innerHTML = ""` or `replaceChildren` to swap phase content — that would unmount any shared nodes (transcript scroller, composer) if they happen to be inside the target container.
