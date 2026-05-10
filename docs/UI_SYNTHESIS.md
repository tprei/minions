# PWA UI synthesis — competitor audit + slice plan

> Status (2026-05-10): the React PWA port is complete (slice-pwa-s0 through slice-pwa-s5).
> This doc captures the original 17-slice vanilla-JS synthesis — historical only.
> See [PWA_DEV.md](./PWA_DEV.md) for the current PWA architecture and `pwa/src/**` for the code.

12-target audit of coding-agent control planes against minions-workflow-core PWA. Findings are UI-shape-specific; engine-shape findings live in the slice 5.2 audit synthesis (`SYNTHESIS.md` on `slice-5.2-audit`).

## Locked decisions

1. **Hybrid phase-based mobile workspace.** Linear states (pending → running → finalizing → merged) get phase-driven UI with one primary CTA per phase. `needs-review` gets a dedicated phase with recovery footer above the transcript. `failed` gets an error phase with Retry / Reset CTAs.
2. **Engine alerts auto-on at install banner, per-workflow push opt-in via star icon.** The install banner subscribes the device to engine-level alerts automatically. Per-workflow push requires an explicit opt-in via the star icon on the workflow detail view.
3. **Client-side hash → city-name alias.** Each workflow gets a deterministic city-name alias derived from a hash of its workflow id, producing roughly 10,000 combinations. The alias is computed entirely in the browser — no engine round-trip.
4. **Structured comments-as-attachments.** Review comments from the diff viewer bundle as `attachments: Comment[]` on `continue-task`. This requires engine slice E1 (`continue-task` must accept an `attachments` field).
5. **Engine-side fire-and-await PR draft.** Auto-generated PR title and description are produced by the engine via `POST /workflows/:id/tasks/:taskId/draft-pr`. The PWA shows skeleton loaders and a Cancel button while the draft is in flight. Requires engine slice E2.
6. **DAG bottom-sheet on mobile, inline panel on desktop.** The task DAG is accessed via a "Tasks" pill in the workspace header. On mobile it opens as a bottom-sheet; on desktop it renders as an inline side panel.
7. **Gestures over buttons for command palette.** Swipe-up from the bottom of the workspace surface reveals the action drawer. The command palette is not a button — it is a gesture entrypoint optimized for one-handed phone use.

## Scope

**Current PWA**: ~1300 LOC. Surfaces: workflow list, kanban (5 cols), transcript (8 provider event kinds), reply box, push-enable banner.

**Engine surfaces NOT yet exposed in PWA** (from slices 14-23):
- `GET /audit/events`, `GET /audit/workflows/:id`
- `GET /alerts`, `POST/DELETE /alerts/subscribe`
- `POST /workflows`, `POST /commands` (continue-task / retry-task / request-restack / transition-task), `POST /workflows/:id/tasks/:taskId/merge`
- SSE durable + transient (`provider-event`, `merge-phase`, `task-transitioned`, `run-started/ended`, `workflow-status-changed`, `graph-operation-changed`)
- `Workflow.graph: Record<TaskId, TaskNode>` multi-task DAG
- `Workflow.operations: Record<OpId, GraphOperation>` restack ops
- `Workflow.policy: { maxConcurrent, autoLand, autoMergeOnGreen }`
- `TaskNode.executionStatus`: 12 values (pending|ready|running|completed|quality-pending|finalizing|pr-open|ci-pending|needs-review|merged|failed|cancelled)
- `TaskNode.runs: NodeRun[]` durable run history
- `TaskNode.artifacts: Artifact[]` — kind ∈ `branch | commit | patch | pr | quality-report | ci-report`. Shape is `{kind, ref, producedBy, createdAt}` only; `ref` is a string the consumer interprets per kind (e.g., a GitHub PR URL we'd lazy-fetch for richer detail)
- `TaskNode.stackStatus`: `clean | restack-pending | restacking | restack-conflict | stale-artifacts`

## 12 audit targets (per-target deep-dives)

| # | Target | UI cardinality | Mobile? |
|---|---|---|---|
| 1 | minions-ui (Thiago's existing UI) | 36 surfaces | yes (signals + Tailwind v4 + Preact) |
| 2 | claude-minions/packages/web | 30 surfaces | yes (Modal→Sheet auto-degrade) |
| 3 | Vibe Kanban (BloopAI) | 19 surfaces | yes (`useIsMobile` fork) |
| 4 | Conductor (closed-source macOS) | 20 surfaces | no |
| 5 | Catnip (wandb) | 18 surfaces | partial (responsive web; iOS app upsell) |
| 6 | CloudCLI (siteboon/claudecodeui) | 12 surfaces | yes (PWA + portrait-lock) |
| 7 | Orca (stablyai) | 14 surfaces | no (Electron) |
| 8 | Emdash (generalaction) | 13 surfaces | no (Electron) |
| 9 | Worktrunk + Rift | n/a + 5 | no |
| 10 | Fleet (bash CLI) + Weave Agent Fleet | 8 + 14 | yes (Weave: foldable detection!) |
| 11 | superset.sh | 14 desktop + 5 mobile | partial (Expo, sparse) |
| 12 | Claude orchestrator (Anthropic Console + agent-teams + community OSS) | varies | console only, no mobile |

Per-target reports archived in agent task outputs under `/tmp/claude-1000/-home-prei-minions-minions-workflow-core/8403350d-5905-46d4-bed8-30e808835a52/tasks/`.

## 20 patterns observed (~12 consensus, rest high-value hypotheses)

Patterns labeled **[consensus]** were cited in 3+ targets. Patterns labeled **[hypothesis]** appeared in 1-2 targets but were qualitatively decisive enough to keep on the list.

### Vocabulary + identity

**1. Status-dot vocabulary with motion-for-busy + color-for-terminal.** [consensus] Spinner border for working (Orca), pulsing dot for active (Catnip + Vibe + minions-ui), check icon for done, red dot for blocked/permission, grey 40% for idle. Motion distinguishes "in progress" from "stuck." Cited in 8/12 targets.

**2. Per-agent color + icon identity.** [consensus] Theme-aware SVGs at `/icons/agents/{provider}-{theme}.svg`. 8-color palette in Weave (Loom blue, Tapestry red, etc.). Number-key model switcher in Conductor. Used consistently across cards, badges, transcript usernames, dropdown selectors. Cited in 6/12.

**3. Workspace memorable aliases.** [hypothesis] Conductor's city-names (`seoul-fern-723`), Catnip's `refs/catnip/$NAME` with friendly branch alias. Solves "which UUID is which" in conversation/notification text. Conductor's `Passport` command lists every city you've visited. Cited in 2/12 but high-value.

**4. SSE pulse dot in app chrome.** [consensus] Persistent live/connecting/retrying indicator. Catnip nav-rail dot, minions-ui status badge with countdown. Removes "is this thing live?" anxiety on mobile networks. Cited in 5/12.

### Layout + chrome

**5. Bottom-sheet on mobile, dialog on desktop (shared component).** [consensus] `Modal` auto-degrades to `Sheet` (claude-minions/web). Drawer side="left" for sidebar, side="bottom" for forms (Catnip, Weave, minions-ui). Cited in 5/12.

**6. Frosted-glass top header + fixed bottom action bar.** [consensus] `bg-background/95 backdrop-blur border-b` (Catnip), `pb-[env(safe-area-inset-bottom)]` for the bottom bar. iOS-native feel. Cited in 4/12.

**7. Phase-based mobile workspace (NOT tabs).** [consensus] Catnip's flagship pattern: ONE phase visible at a time, derived from session state (input → todos → diff → PR). ONE primary CTA at bottom per phase. Removes "which tab am I supposed to look at." Cited in 3/12, qualitatively decisive for mobile.

**8. Tabs hidden, not unmounted.** [consensus] When mobile views switch, use `display: none` to preserve SSE subscription, terminal connection, scroll position, iframe state across tab switches. Cited in 3/12 (Vibe Kanban, Orca, claude-minions/web).

### Composer + reply

**9. Composer that shape-shifts by session/task status.** [consensus] ONE bottom action bar that mutates label/behavior across modes: idle (Send) → running (Queue with `ClockIcon` "Queued for AI") → feedback-mode (Submit retry) → stopping (disabled). Vibe Kanban's `SessionChatBox` is the reference. Cited in 4/12. NOTE: original draft included an "approval-mode" — dropped because the engine has no approval command surface (`/commands` only accepts transition-task / request-restack / continue-task / retry-task per `src/transport/server.ts:48`).

**10. Drafts that persist across reload.** [consensus] Composer text + selected attachments + queued review comments persist to localStorage keyed by task. Phones suspend tabs aggressively. Conductor explicitly designed for this; Weave has `useDraftState(sessionId)`. Cited in 3/12.

**11. Auto-generated PR title/description with skeleton + Cancel.** [hypothesis] User's first action is "approve the AI's draft", not "type from scratch." Conductor + Catnip both ship this. Cited in 2/12 but critical for mobile keyboard pain.

### Approvals + plan gates

**12. Approval as inline chat entry + composer-mode parallel.** [consensus, BUT NOT ACTIONABLE TODAY] Approvals belong in the transcript timeline (Vibe Kanban `ChatApprovalCard`, Conductor inline allow/deny, CloudCLI sticky banner above composer). Composer separately enters approval-mode so the same hotkey works from the typing surface. Two-stage state: default → deny-with-reason. Cited in 5/12 + Claude Code agent-teams. **Engine prerequisite missing**: no `approve-permission` command in `/commands` validator. Pattern recorded but UI cannot fulfill it; deferred until engine adds an approval command surface.

**13. Plan-approval gate as two-button decision.** [consensus, BUT NOT ACTIONABLE TODAY] Plan-mode → agent submits plan → user approves/rejects with optional feedback → loop. Claude Code agent-teams + Conductor + Superset all ship this. Separates intent from execution. Cited in 3/12. **Engine prerequisite missing**: no plan-mode state, no plan-approval command. Same constraint as 12.

**14. Footer-overlay permission prompts.** [hypothesis, BUT NOT ACTIONABLE TODAY] Pinned header/footer + scrollable option buttons (Superset's pattern). Beats inline Q&A on narrow viewports. Cited in 1/12, specifically optimized for phones. Same engine-prerequisite gap as 12 / 13.

### Activity rendering

**15. Activity stream as typed events (NOT chat bubbles).** [consensus] Per-event-kind icon + color: User/Bot for messages, ArrowRight/Left for delegation, Wrench for tool calls, CheckSquare for plan progress, Coins for cost (Weave). Cited in 5/12. Strong consensus.

**16. Tool-call aggregation with collapse-by-default.** [consensus] Group N consecutive `Read`/`Edit`/`Glob` calls into one expandable group with `+N more` chevron. CloudCLI auto-expands when scrolled into view via `IntersectionObserver`. Cited in 4/12.

### State surfacing

**17. Token/cost tiered colors.** [consensus] Green <$0.01, yellow <$0.10, orange <$1.00, red >=$1.00 (Weave). Pill in transcript header + sidebar detail. Cited in 3/12.

**18. Connection icon shown only when unhealthy.** [hypothesis] Don't render a green checkmark when everything's fine — use the absence-of-icon as the healthy state. Saves pixels on mobile (Weave Agent Fleet is the explicit cite). Cited in 1/12, adopted as a corollary to finding 4.

### PWA hygiene

**19. Service worker that refuses to cache app code.** [hypothesis, but decisive] Manifest-only precache; `mode==='navigate'` always network-first; `/api/` and `/task` SSE pass-through; only hashed `/assets/` cache-first. Tag-keyed renotify with `${taskId}:${eventCode}`. Notification → SPA navigate via postMessage (no full reload). Server-side dedupe (20s) on `task:kind:code`. CloudCLI is canonical; Catnip explicitly does NOT have this and admits their mobile web is a placeholder. Cited in 2/12. **Our current SW does the OPPOSITE** — `pwa/sw.js:2` precaches `/`, `app-v1.js`, `styles-v1.css` directly, which is exactly the "user pinned an old build" footgun this finding warns against.

**20. Eager reconnect / silent restore.** [consensus] Daemon checkpoints raw output every 5s; on cold start return `coldRestore: { scrollback, cwd }`; UI rehydrates without showing "session lost" modal (Orca). minions-ui has 70s SSE watchdog with quiet/noisy reconnect distinction. claude-minions/web does per-slug high-water backfill on reconnect. Cited in 4/12.

## What we have vs what we need

Verified against `pwa/index.html`, `pwa/assets/app-v1.js`, `pwa/assets/styles-v1.css`, `pwa/sw.js`, `pwa/manifest.json` (current master).

| Finding | Have? | Notes |
|---|---|---|
| 1 status dots | partial | 5-state palette in `app-v1.js`/`styles-v1.css`; live-indicator at `styles-v1.css:76` already pulses on connected state via `pulse-dot` keyframes; missing motion semantics for *busy* tasks (only the SSE link pulses) |
| 2 agent identity | no | provider names appear in events but no icons / per-provider color |
| 3 workspace aliases | no | bare workflow IDs only |
| 4 SSE pulse | **yes** | `live-indicator` at `app-v1.js:143` — tracks `connecting / connected / reconnecting` with countdown; finding-4 already implemented |
| 5 bottom-sheet ↔ dialog | no | push banner is the only mobile-shaped chrome |
| 6 frosted glass | no | flat header |
| 7 phase-based mobile | no | desktop-shaped layout copied to mobile |
| 8 hidden-not-unmounted | no | full tab swaps lose SSE state |
| 9 composer shape-shift | no | single textarea + Send button always |
| 10 drafts persist | no | textarea wiped on navigate |
| 11 auto-PR drafting | no | manual title/body |
| 12 inline approval card | **defer** | engine has no approval command (`/commands` accepts only transition/restack/continue/retry). Hold the UI pattern until an `approve-permission` engine slice ships |
| 13 plan-approval gate | **defer** | no plan-mode in engine; same engine prerequisite gap as 12 |
| 14 footer-overlay prompts | **defer** | same engine prerequisite gap as 12 |
| 15 typed activity stream | partial | 8 event kinds rendered but as bubbles, no per-event icon/color discrimination |
| 16 tool-call aggregation | no | no clustering |
| 17 cost tiered colors | no | no cost surfacing at all |
| 18 connection-icon-only-when-unhealthy | partial | the live-indicator does change color on reconnect, but no "hide-when-healthy" rule on workflow cards |
| 19 SW refuses to cache app code | **inverted** | `pwa/sw.js:2` precaches `/`, `app-v1.js`, `styles-v1.css` directly. This is the opposite of finding 19. Replacing the cache strategy is the highest-priority PWA correctness fix |
| 20 eager reconnect | partial | reconnect logic exists in `app-v1.js`; cursor-based backfill not yet wired |

Coverage of the consensus subset (~12 findings): ~4 partial / 1 yes (SSE pulse) / 1 inverted (SW). The inverted SW is the most important single fix.

Engine surfaces NOT yet rendered:
- audit events feed
- alerts list / engine-level subscriptions
- workflow create form
- multi-task DAG visualization
- run history (`TaskNode.runs`)
- artifacts (branch / pr / patch / ci-report / quality-report)
- merge-phase progress
- restack operations strip
- stack-status pill
- workflow.policy editor

## Proposed slice ordering

10 slices, each 1-2 days, ordered by what unblocks what. Mirrors slice 5.2 synthesis structure.

### UI-1 — Design system + layout shell foundation

**Shape**: lift CSS-variable design tokens (semantic color ramps from claude-minions `index.css`); status-dot palette with motion-for-busy; agent-icon system (theme-aware SVGs at `/icons/agents/{provider}-{theme}.svg`); shared `Sheet` component (bottom on mobile, side rail on desktop) with drag-to-dismiss + safe-area-inset; `Modal` auto-degrades to `Sheet` on `useMediaQuery('(max-width: 767px)')`; frosted-glass top header (`bg-background/95 backdrop-blur border-b`); fixed bottom action bar with `pb-[env(safe-area-inset-bottom)]`; bottom tab bar / left rail shared component. Lift `usePullToRefresh`, `useSwipeToDismiss`, `useHaptics`, `useLongPress` from minions-ui.

**Dependencies**: none. Findings 1, 2, 5, 6, 8.

**Unblocks**: every subsequent UI slice.

**Files**: new `pwa/assets/components/` directory; `pwa/assets/styles-v2.css` replaces v1.

### UI-2 — Service worker + push pipeline + SSE connection

**Shape**: SW that refuses to cache app code (manifest-only precache, navigate=network-first, `/api/` + `/task` pass-through, only hashed `/assets/` cache-first); push payload tagged `${taskId}:${eventCode}` with `renotify: true`; notification-click → SW postMessage → SPA route (no full reload); server-side dedupe map (20s window) on `task:kind:code` keys; SSE pulse dot in chrome (live / connecting / retrying with countdown); eager reconnect with cursor-based backfill; "Add to Home Screen" install prompt with localStorage dismiss; update banner with skipWaiting + clientsClaim. Public `/clear-cache.html` escape hatch.

**Dependencies**: UI-1. Findings 4, 18, 19, 20.

**Unblocks**: real PWA install + reliable push (UI-7 audit/alerts).

**Files**: rewrite `pwa/sw.js`; add `pwa/assets/push.js`, `pwa/assets/sse.js`; touch `src/transport/server.ts` for the push dedupe map.

### UI-3 — Phase-based mobile workspace + composer shape-shifter

**Shape**: workflow detail view becomes a phase-aware container. Phase derived from `TaskNode.executionStatus`:
- `pending|ready` → input phase (textarea + Start CTA)
- `running` → transcript phase (composer + queue indicator)
- `completed|quality-pending` → review phase (auto-routes to next gate)
- `finalizing|pr-open` → diff phase (review surface + Land/Approve CTA)
- `merged` → summary phase
- `failed|cancelled` → error phase (Retry / Reset CTAs)
- `needs-review` → operator phase (recovery footer with Retry/Resume/Abort)

ONE primary CTA per phase. Composer shape-shifts: idle→Send, running→Queue, approval-mode→Approve/Request-Changes split, feedback-mode→Submit. Drafts persist to localStorage keyed by `${workflowId}:${taskId}`. Composer text restored on mount.

**Dependencies**: UI-1. Findings 7, 9, 10.

**Unblocks**: structured composer for UI-4 + UI-8.

**Files**: rewrite `pwa/assets/app-v1.js`'s task detail section; new `pwa/assets/composer.js`.

### UI-4 — Activity stream redesign (typed events + tool aggregation)

**Shape**: drop chat-bubble metaphor; render typed events with per-kind component dispatch table:
- `assistant_text` → markdown, left-aligned, no avatar
- `thinking` → collapsible card with `💭` chevron, default-collapsed
- `tool_call` → single-line `&lt;ToolHeader&gt; &lt;ToolInput preview&gt; &lt;ToolStatus&gt;` with click-to-expand to `&lt;ToolOutput&gt;`
- `usage` → cost tier badge with green/yellow/orange/red color
- `error` → red bordered card
- `final` → highlighted summary

Tool-call aggregation: collapse N≥3 consecutive same-kind calls (`Read`, `Edit`, `Glob`, `Grep`) into one expandable group with `+N more` chevron. `IntersectionObserver` auto-expands when scrolled into view (opt-out in settings). Auto-scroll suspended on manual scroll; "Jump to latest" floating button when scrolled up. Streaming throttle via three-ref pattern (`streamBufferRef + streamTimerRef + accumulatedStreamRef`). Per-event icons from Lucide.

**Permission/approval card explicitly DROPPED from this slice.** Engine has no `approve-permission` command; rendering an approval UI we can't fulfill is worse than not rendering it. When the engine adds an approval command (separate engine slice), we add the inline `ApprovalCard` + composer approval-mode in a follow-up UI slice.

**Dependencies**: UI-1, UI-3. Findings 15, 16 (12/13/14 deferred until engine support exists).

**Unblocks**: agent runs become readable on phones.

**Files**: rewrite `pwa/assets/app-v1.js`'s transcript section; new `pwa/assets/transcript/` directory.

### UI-5 — Workflow detail with DAG + run history + artifacts

**Shape**: render `Workflow.graph: Record<TaskId, TaskNode>` as a collapsible DAG panel above the transcript when N tasks > 1. Each task: status dot (with motion when running), title, dependsOn edges visible, stack-status pill when `stackStatus !== "clean"` (4 non-clean states: `restack-pending | restacking | restack-conflict | stale-artifacts` from `src/domain/types.ts:35`). Tap a task → focus its transcript inside the same workspace. Per-task "Runs" sub-panel: collapsible list of `TaskNode.runs` with attempt N+1 numbering, terminal reason, duration, restore-from-this-run button.

Artifact rendering per kind. The engine's `Artifact` type carries only `{kind, ref, producedBy, createdAt}` — `ref` is a string the consumer interprets per kind. The PWA renders a thin per-kind component that derives display from `ref`, lazy-fetching external data when richer detail is needed:

- `branch` → `⎇ &lt;ref&gt;` chip (ref is the branch name)
- `commit` → `&lt;short-sha&gt;` chip (ref is the commit SHA)
- `pr` → minimal card with PR URL link + state derived from `ref` parsing. **Lazy-fetches `https://api.github.com/repos/{owner}/{repo}/pulls/{number}`** for state pill, checks summary, author avatar, body. Cache 30s, refetch on focus.
- `patch` → expandable inline diff (engine produces patch text directly via `ref`)
- `ci-report` → parse `ref` as JSON `{prNumber, prUrl, headSha, failed: [{name, conclusion}], at}` per slice 19's `CIBabysitterService` shape; render as grouped check list
- `quality-report` → parse `ref` as JSON `{overallStatus, checks, ranAt}` per slice 20's `QualityGateService` shape; per-gate row with pass/fail icon

Workspace memorable alias generated client-side (city-name from a hash of workflow id) on first render; displayed in header next to canonical UUID.

**Dependencies**: UI-1, UI-3, UI-4. Findings 2, 3, 17.

**Unblocks**: multi-task workflows usable on mobile.

**Files**: new `pwa/assets/dag-panel.js`, `pwa/assets/runs.js`, `pwa/assets/artifacts/` dispatch (one renderer per kind).

### UI-6 — Workflow creation (prompt-first sheet)

**Shape**: bottom-sheet new-workflow composer, accessible from a FAB at `bottom-4 right-4 + safe-area-inset` on mobile / "+ New Workflow" header button on desktop.

Fields trimmed to what `POST /workflows` validator (`src/transport/validators.ts:191`) actually accepts: `id` (auto-generated unless overridden), `kind` (single-task / multi-task / etc), `tasks: TaskSpec[]` (each task = `{id, title, prompt, dependsOn?}`), `policy?: {maxConcurrent?, autoLand?, autoMergeOnGreen?}`. Single-task path is the common case: prompt textarea (auto-grow) + optional title + policy toggles → builds a one-task workflow client-side and POSTs.

Multi-task path: "+ Add task" repeats prompt + title; depends-on picker (chips of prior task IDs) for sequencing.

Submit POSTs to `/workflows` and routes to the new workflow detail.

**Explicitly DEFERRED from this slice** (no engine surface today):
- Repo picker — engine has no `version.repos` endpoint to enumerate
- Provider/agent selector — engine has no per-workflow provider override (provider is a global engine config via `MWF_PROVIDER`)
- Image attachments — `POST /workflows` validator has no attachment field
- Smart name detection from pasted GitHub/Linear URL — depends on a backend resolver we don't have

These get a follow-up UI-6.5 once the matching engine slices ship (repo enumeration endpoint, per-workflow provider override, attachment-bearing workflow create, URL resolver).

**Dependencies**: UI-1, UI-3. Finding 6 (bottom sheet).

**Unblocks**: workflow creation from phone without curl.

**Files**: new `pwa/assets/new-workflow-sheet.js`.

### UI-7 — Audit feed + alert center + engine alerts subscription

**Shape**: new top-level tab "Activity" with two sub-views:
- **Audit feed**: paginated list rendering `GET /audit/events` with cursor pagination ("Load more" button). Each row: action (mono accent), timestamp (relative), actor, target (`<kind>:<id>`), expandable JSON detail. Filter chips (action / workflow / time range). Pull-to-refresh.
- **Alerts**: paginated list from `GET /alerts`. Each card: severity color (warn yellow / error red), `kind` (merge-inconsistent / push-failures-spike / boot-recovery-failed / orchestrator-silent / ci-exhausted), `message`, `workflowId`/`taskId` link, `ackd_at` button (when slice 24+ adds ack flow). Tap → jumps to source workflow.

Engine-level alerts subscription separate from per-workflow push: settings toggle "Subscribe to engine alerts" → `POST /alerts/subscribe { subscription }`. Surfaces in same SW push handler as per-workflow notifications but tagged `alert:${alertKind}` for renotify replacement.

**Dependencies**: UI-1, UI-2. Findings 4, 6.

**Unblocks**: operator visibility into engine state.

**Files**: new `pwa/assets/audit.js`, `pwa/assets/alerts.js`, `pwa/assets/alert-subscribe.js`.

### UI-8 — PR/CI surface + manual merge + comments-as-attachments

**Shape**: PR card (already in UI-5 artifacts) becomes a tab in the workspace detail. Per-tab content:
- PR header: title, state pill, mergeable badge, author chip, branch refs
- Checks panel: per-check rows with status dot, name, duration, "View logs" link. Polling cadence: 30s start with exponential backoff to 120s on no-change, reset on change. Pause polling when tab hidden.
- Diff viewer: lazy-mounted file tree, side-by-side / unified auto-flip on viewport, per-line click-and-drag for multi-line range comments. Comments persist to localStorage as drafts.
- Comments-as-attachments: multi-select diff comments → "Send to agent (N)" composer attachment. Comments rendered in next composer message as a structured pill ("Queued for AI · 3 comments"). Tap pill → jumps to comment source.
- Merge action: "Land" CTA gated on `mergeable === "clean"`. Tapping triggers `POST /workflows/:id/tasks/:taskId/merge`. Phase progress stepper: prepareMerge → commit → squash → rebase → applyMerge → finalize, subscribed to `merge-phase` SSE events.

Auto-draft PR title/description: when creating a PR (engine-side, not UI), the engine fires an agent run to draft title + body. UI shows skeleton loaders in the dialog with "Cancel Generation" button.

**Dependencies**: UI-1, UI-3, UI-4, UI-5. Findings 11, 13.

**Unblocks**: human-in-the-loop merge from phone.

**Files**: new `pwa/assets/pr-tab.js`, `pwa/assets/diff-viewer.js`, `pwa/assets/merge-progress.js`.

### UI-9 — Restack operations + completion-dispatcher visualization

**Shape**: when `Workflow.operations[]` has in-flight entries, render an "Operations" strip above the DAG panel: each op as a card with kind (`request-restack`), affected tasks (chips), conflict explainer (markdown body), resolve button (when applicable). Operations resolve via SSE `graph-operation-changed` events.

Workflow card in kanban gains autoLand/autoMergeOnGreen indicator badges. CompletionDispatcher progress visualization for tasks in `finalizing → pr-open → ci-pending → merged`: small horizontal stepper inline on the task header, advances via `task-transitioned` SSE events.

**Dependencies**: UI-5. Found patterns from Worktrunk's 6-phase merge stepper applied to our state machine.

**Unblocks**: stack-aware UI (rare today, important for multi-task DAGs).

**Files**: new `pwa/assets/operations-strip.js`, `pwa/assets/completion-stepper.js`.

### UI-10 — Polish + power-user

**Shape**:
- Command palette (Cmd+K on iPad with keyboard) / bottom-sheet "Actions" drawer on phone. Shared action catalog (jump to workflow, switch view, toggle theme, open audit, etc.).
- Workspace passport: `Activity → Passport` lists every workflow's city-name alias.
- Cost burn-rate badge in workspace header (green/yellow/orange/red tiers from `usage` events).
- Per-agent color identity throughout (status dots, transcript usernames, dropdown chips, kanban card edge accents).
- Theme toggle (light / dark / system) with `theme-color` meta tag dynamically updated.
- Pull-to-refresh consistency across all paginated lists.
- Long-press context menu on kanban cards: pin, rename, archive, retry, jump-to-PR.

**Dependencies**: UI-1 through UI-9. Findings 2, 3, 17.

**Unblocks**: feels-like-native polish.

**Files**: `pwa/assets/command-palette.js`, scattered touches across all components.

## Cutover criteria for the new PWA

**Minimum viable** (UI-1 through UI-7):
1. Service worker installs reliably on iOS Safari standalone, refuses to cache app code
2. Push notifications arrive on phone, tap navigates inside SPA
3. SSE connection stays live with visible pulse + reconnect on resume
4. Workflow create from phone POSTs `/workflows` (single-task path) and routes to detail
5. Activity stream renders 8 event kinds with tool aggregation (no approval card — engine prereq)
6. Audit feed + alerts list surface engine state
7. Phase-based mobile workspace shows ONE primary CTA per phase
8. All forms use bottom-sheet on mobile

**Full** (UI-8 through UI-10):
- Manual merge with phase progress visible
- Comments-as-attachments bundle to agent
- Multi-task DAGs render with restack ops + completion stepper
- Command palette / power-user shortcuts
- Per-agent color + icon identity throughout

## Deferred / out-of-scope

- **Memory subsystem** (claude-minions/web has it, our engine doesn't)
- **Multi-connection management** (`ConnectionRail`, `ConnectionPicker`) — single engine for v1
- **Variant race / judge views** (no engine support)
- **Loops drawer** (no engine support)
- **Schema-driven runtime config** (engine `/config/runtime` endpoint not yet shipped)
- **Resource monitor / doctor** (no `/metrics` endpoint)
- **Embedded VS Code** (desktop-only)
- **In-PWA terminal (xterm.js)** — phones can't do it well; surface shell *output* in transcript
- **`@`-mention typeahead** for files / tasks / GitHub issues — heavy; defer to UI-10+
- **Voice dictation** — shipped in minions-ui, useful, but not core for cutover
- **Foldable detection** — Weave has it; useful but vanishingly rare audience

## Open questions

1. **Phase-based vs tabbed mobile workspace**: phase-based is decisive for Catnip but their state machine is linear; ours has branches (stuck-in-needs-review, autoLand-true, autoMerge-true). Which phases collapse and which fork?
2. **Per-workflow vs engine push subscriptions**: should the same UI surface both, or two distinct settings rows?
3. **Workspace passport (city aliases)**: client-side hash → name mapping, or engine-issued at workflow create?
4. **Comments-as-attachments engine support**: does the reply queue accept structured `attachments: Comment[]` payloads, or does the PWA serialize to markdown?
5. **Auto-draft PR title/body**: engine-side fire-and-await, or PWA spawns a follow-up agent run?
6. **DAG panel above transcript or as a separate tab**: depth vs breadth on small screens
7. **Command palette on phone**: bottom-sheet drawer? long-press FAB? swipe up from bottom?

## After UI-1 through UI-10 — recorded for next planning session

- **Tablet split-view layouts** (iPad keyboard support, foldable foundation)
- **Native iOS app** if PWA push reliability becomes the bottleneck
- **Multi-engine connection management** if multi-tenancy emerges
- **Voice composer** (Web Speech API, hold-to-record gesture)
- **`@`-mention typeahead**

---

Per-target reports (huge, ~5000 lines each) at:
- `/tmp/claude-1000/-home-prei-minions-minions-workflow-core/8403350d-5905-46d4-bed8-30e808835a52/tasks/aeb9644d0c88eb867.output` (minions-ui)
- `.../a1092c6ec32b588ac.output` (claude-minions/web)
- `.../af2415b14a13ab783.output` (Vibe Kanban + Conductor + Catnip)
- `.../a608e77c388ded91b.output` (CloudCLI + Orca)
- `.../af62878a250af0c2a.output` (Emdash + Worktrunk + Fleet+Weave)
- `.../ab02cac5565cc248f.output` (superset.sh + Claude orchestrator)
