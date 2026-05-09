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

## Transcript event pipeline

The transcript phase renders a typed activity stream driven by the engine's `provider-event` SSE stream. The pipeline lives under `pwa/assets/transcript/`.

### Dispatch table

Each `provider-event` carries a `providerEvent` object with a `kind` field. The pipeline maps each kind to a per-kind renderer in `pwa/assets/transcript/events/`:

| kind | renderer file | notes |
|------|--------------|-------|
| `assistant_text` | `assistant-text.js` | Markdown via `marked`, sanitized via `DOMPurify` |
| `thinking` | `thinking.js` | Collapsible card, default-collapsed |
| `tool_call` | `tool-call.js` | Single-line header + click-to-expand details; status dot from UI-1 |
| `tool_result` | `tool-result.js` | Adopts parent group's expansion state |
| `usage` | `usage.js` | Cost tier pill (green/yellow/orange/red) based on `costUsd`; falls back to token counts |
| `error` | `error.js` | Red-bordered card; optional stack trace toggle |
| `final` | `final.js` | Highlighted summary panel |

Renderers export a single `render(event, ctx?)` function that returns an `HTMLElement`. No framework.

The `permission_request` kind is intentionally absent — it is handled in UI-4.5 (approval card slice).

### Aggregation

`pwa/assets/transcript/aggregate.js` exports `aggregateConsecutive(events, kindsToCluster, previousGroups)`.

Rules:
- N≥3 consecutive `tool_call` events with the **same `name`** (e.g., three `Read` calls in a row) are collapsed into a `ClusterGroup`.
- The cluster renders as a `+N <toolName> calls` button (collapsed by default).
- Clicking the chevron or scrolling the cluster into view (via `IntersectionObserver`, threshold 0.5) expands the group inline.
- Re-clustering runs on every event append. `previousGroups` carries the existing groups so expansion state is preserved across re-clusters.

Currently clustered tool names: `Read`, `Edit`, `Glob`, `Grep`.

To add a new tool to the cluster set, add its name to `CLUSTER_TOOL_NAMES` in `pwa/assets/transcript/pipeline.js`.

### Streaming throttle

`pwa/assets/transcript/streaming.js` exports `createStreamBuffer(onFlush)`.

- `appendDelta(text)` — buffers text and schedules a flush (33ms / ~30fps).
- `flush()` — forces an immediate flush and clears the timer.
- `reset()` — clears buffer and accumulated text.
- `getAccumulated()` — returns flushed accumulated text.

The pipeline accumulates `assistant_text` deltas synchronously for DOM correctness, and uses the stream buffer to coalesce markdown re-renders during rapid streaming.

### Auto-scroll and jump button

The transcript scroller tracks scroll position on every `scroll` event:
- Within 64px of the bottom → auto-scroll is enabled; new events scroll the view to the bottom.
- User scrolls up beyond that threshold → auto-scroll suspends and a floating "Jump to latest ↓" button appears.
- Clicking the button scrolls to bottom and re-enables auto-scroll.

The jump button is appended as a sibling of the scroller (inside the scroller-wrap), styled with `position: absolute`.

### Adding a new event kind

1. Create `pwa/assets/transcript/events/<kind>.js` exporting `render(event, ctx?) → HTMLElement`.
2. Add a corresponding `pwa/assets/transcript/events/<kind>.d.ts` declaring the `render` export so TypeScript tests can import it.
3. Add the kind to the `DISPATCH` table in `pwa/assets/transcript/pipeline.js`.
4. Add render tests in `test/pwa/transcript/events.test.ts` (mock the vendor deps with `vi.mock`).
5. If the new kind should cluster, add it to `CLUSTER_KINDS` and `CLUSTER_TOOL_NAMES` in `pipeline.js`.

## Approval flow (UI-4.5)

Gates on engine prerequisite **E3** (`approve-permission` command).

### How it works

When a `permission_request` provider event arrives in the transcript, the pipeline renders an `ApprovalCard` inline via `pwa/assets/transcript/events/approval.js`. Simultaneously, the pipeline calls its `onApprovalChange` callback, which the `WorkspaceShell` uses to switch the composer into `approval` mode and wire up hotkeys.

### ApprovalCard state machine

Two stages, rendered inline in the transcript:

1. **Default** — shows tool name, input preview, [Approve] and [Deny] buttons.
2. **Deny-with-reason** — clicking Deny hides the default actions and reveals a `<textarea>` + [Submit Deny] [Back] buttons. Submit is blocked until the textarea is non-empty (mirrors the engine validator: `reason` is required when `decision === "deny"`).

On Approve: POST `/commands` with `{kind: "approve-permission", workflowId, taskId, requestId, decision: "approve"}`.

On Submit Deny: POST with `decision: "deny", reason`. Both paths show server errors inline (no toast). On success, the card displays a success label and becomes inert.

### Composer approval-mode

While the most recent transcript event is a pending `permission_request`, the shell sets composer mode to `approval`. This:

- Shows the hint "Approval mode — A to approve, D to deny".
- Disables the primary submit button (the inline card is the action surface).
- Listens for `keydown` on the textarea: when the textarea is empty, pressing **A** calls `onApprove()` (triggers card's Approve flow); pressing **D** calls `onDeny()` (triggers card's deny-form reveal).

When the approval is resolved (approved or denied), `onApprovalChange` fires with `null` and the composer reverts to `running` mode.

### Pipeline context

`createTranscriptPipeline` now accepts a second argument:

```js
createTranscriptPipeline(scrollerEl, { workflowId, taskId })
```

The context is passed to each renderer call so approval cards can POST to the correct IDs without a separate mechanism.

`setOnApprovalChange(fn)` registers a callback that fires whenever the pending approval state changes (new pending event or resolution). `getPendingApproval()` returns the live `HTMLElement` for the pending card (used by the shell to delegate hotkey actions directly to `el.__approve()` / `el.__openDeny()`).
