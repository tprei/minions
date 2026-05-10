# Workflows-as-chats: persistent transcript replay + always-visible composer

## Context

The 7-slice PWA port (S0–S6) is merged at `861b89d` and deployed at `claude.prschdt.xyz`. First-day dogfood found a load-bearing gap: workflows don't behave like chats.

Concretely: open a workflow that finished a few seconds ago and the transcript area is empty. The engine published the provider events (`assistant_text`, `tool_call`, etc.) only via `publishTransient()` (`src/persistence/subscriber-hub.ts:124-135`) — they reach live SSE subscribers and are then gone. The SSE replay endpoint (`src/transport/server.ts:365-407`) only backfills the 5 persistent kinds; provider events have no `id:` line so the cursor never advances. The complete transcript exists on disk as stream-json (`${dataDir}/sessions/${runtimeSessionId}.log`, ~6 KB after a 6 s claude run, persists indefinitely), but no API exposes it.

The PWA compounds the problem: `WorkflowDetail.tsx:241-290` mounts `TranscriptView` only in 3 active phases (`running | quality-pending | ci-pending`); every other phase replaces it with a phase-specific card. `Composer.tsx:37` hardcodes `disabled` for `completed | merged | finalizing | pr-open | cancelled`.

Goal of this change: the workflow detail feels like Claude Code's terminal — you open it and see all past assistant text and tool calls; live events stream in as they arrive; the composer is always visible with clear state about whether reply is available right now. Reference behavior: Claude Code itself, conductor.build, superset.sh.

## Locked scope (per user clarifications)

1. **Reply scope: needs-review only.** Engine FSM constraint (`continue-task-service.ts:76-80`) stays. Composer is always visible but disabled with a clear hint in non-`needs-review` states. Loosening the FSM is a separate, larger piece of work.
2. **Transcript API: on-demand from disk logs.** No SQLite schema change. New endpoint reads each run's `.log`, parses stream-json, returns the concatenated event stream tagged with `(runId, seq)` for dedup. Pagination is a TODO.
3. **Layout: coexist.** Phase-specific UI (PR tab, DraftPrPanel, OperationsStrip, CompletionStepper, error/review banners) stacks ABOVE the always-visible transcript + composer. The transcript is the spine.

## Engine changes

### 1. `src/transcript/stream-json-parser.ts` (new)

Lift the stream-json parsing logic out of `src/plugins/providers/claude-code.ts` (`parseFrame()` or its equivalent) into a reusable module:

```ts
export function parseFrame(line: string): ProviderEvent | null
```

- Returns `null` on malformed/unknown lines (do not throw — robustness for serving old/in-progress log files)
- Re-export from `src/plugins/providers/claude-code.ts` so its existing call site keeps working

### 2. `src/domain/events.ts` — tag provider-event payload with identity

Extend `ProviderEventPayload` (lines 64-68):

```ts
interface ProviderEventPayload {
  taskId: string;
  runId: string;            // existing
  providerEvent: ProviderEvent;
  seq: number;              // NEW — monotonic per runtimeSessionId log file
}
```

Source of `seq`: the line number in the run's `.log` file at the moment the event was tailed and emitted. Engine reads logs line-by-line (`src/plugins/tmux/log-follow.ts`); attach the line number when publishing the transient event. Same value the transcript endpoint will return.

### 3. `src/transport/server.ts` — new transcript endpoint

```
GET /workflows/:id/tasks/:taskId/transcript
→ 200 { events: TranscriptEvent[], cutoff: { runId, seq } | null }
→ 404 if workflow or task not found

TranscriptEvent = ProviderEvent & { runId: string; attempt: number; seq: number }
```

Implementation:
- Look up workflow → task → `task.runs`, sort by `attempt`
- For each run: read `${dataDir}/sessions/${run.runtimeSessionId}.log` (path constructed exactly like `tmux-runtime.ts:76`)
  - File may not exist (rare — newly-started run, never written). Skip with no error.
- For each line: `parseFrame(line)`. Drop nulls. Wrap with `{ runId, attempt, seq: lineNumber }`.
- Concat all runs in order
- `cutoff` = identity of the last event in the concat result (used by PWA as the dedup boundary)

Empty array is a valid 200 response (task with no runs yet).

### 4. Where `seq` originates inside the engine

Find the publisher path that calls `subscriberHub.publishTransient(... kind: "provider-event" ...)`. It's downstream of `log-follow.ts` reading log lines. Add a per-`runtimeSessionId` counter (in-memory; resets on engine restart, which is fine because both subscribers and counters reset together) that increments per emitted event. Pass that counter as `seq` in the payload.

This keeps live `seq` values aligned with what the transcript endpoint returns (line number in the log file = `seq` of the event the engine published from that line).

## PWA changes

### 5. `pwa/src/domain/types.ts` — transcript types

```ts
export interface TranscriptCursor { runId: string; seq: number }
export interface TranscriptEvent { runId: string; attempt: number; seq: number; event: ProviderEvent }
```

(Mirror engine `TranscriptEvent` shape.)

### 6. `pwa/src/transport/rest.ts` — new fetcher

```ts
export async function getTaskTranscript(
  workflowId: string,
  taskId: string,
): Promise<{ events: TranscriptEvent[]; cutoff: TranscriptCursor | null }>
```

Standard `request<T>()` helper, no special handling.

### 7. `pwa/src/views/TranscriptView.tsx` — fetch + merge

Refactor the lifecycle:

- State: `events: TranscriptEvent[]`, `historyLoaded: boolean`, `liveBuffer: TranscriptEvent[]`, `seenIds: Set<string>` (key = `${runId}:${seq}`)
- Mount sequence:
  1. Subscribe to live provider-events first → push every event into `liveBuffer` (and `seenIds`)
  2. Call `getTaskTranscript(workflowId, taskId)` → on resolve:
     - Filter history events: drop any whose `(runId, seq)` is already in `seenIds` (rare race window but cheap)
     - Set `events = [...history, ...liveBuffer.filter(e => not in history)]`
     - Drain `liveBuffer`
     - Set `historyLoaded = true`
- After `historyLoaded`: live events go directly into `events`; check `seenIds` to dedup
- On SSE state transition `connected` → `reconnecting` → `connected`: re-fetch transcript so we recover provider events lost in the gap (new effect listening to `useConnectionStore`)
- Existing `streaming.ts` (RAF batch) and `aggregate.ts` (cluster ≥ 3) pipeline is pure — feed it the full event list; no changes needed

### 8. `pwa/src/views/WorkflowDetail.tsx` — coexist layout

Replace the phase-switch-replaces-UI pattern with a stacking layout:

```
Header: title, status pill, tasks pill, push star
[ConnectionBanner if reconnecting/error]                  // existing
[QueuedMessage banner if pending send]                     // existing
[OperationsStrip if any in-flight ops]                     // existing
[NeedsReviewBanner if status === needs-review]             // NEW (lifted from existing phase card)
[ErrorBanner if status === failed | cancelled]             // NEW (lifted)
[CompletionStepper if status ∈ finalizing/pr-open/ci-pending/merged]   // existing — already inline-ish
[DraftPrPanel if status === finalizing && !hasPr]          // existing — moves above transcript
[PrTab if hasPr]                                            // existing — moves above transcript (collapsible)
─────────────────────────────────────────────
[TranscriptView] (mount when activeTask.runs.length > 0)
[Composer] (always mounted; gated internally — see #9)
```

Concrete behavior changes:
- Drop the "either transcript OR phase card" branching at `WorkflowDetail.tsx:241-290`
- Mount transcript whenever `activeTask?.runs.length > 0`
- Mount composer always when there's an active task
- Phase-specific UI now renders in the area above the transcript as a stack of optional cards (each one self-gating based on workflow/task state)
- The `pending | ready` state continues to show no transcript (no runs yet) — composer is mounted but disabled with hint

PR tab and DraftPrPanel sizing: keep them collapsible so they don't push the transcript off-screen. Default state: collapsed if transcript has any events; expanded if transcript is empty.

### 9. `pwa/src/components/Composer.tsx` — always visible, gated

Refactor `deriveMode` (`Composer.tsx:9-39`):

```ts
type ComposerAvailability =
  | { available: true; mode: "idle" | "running" | "feedback" | "approval" }
  | { available: false; reason: string }
```

Mapping:
- `needs-review` → `{ available: true, mode: "feedback" }` — POSTs `continue-task` (works today)
- `running | quality-pending | ci-pending` with no `pendingApproval` → `{ available: true, mode: "running" }` — Queue button (existing behavior)
- `running | quality-pending | ci-pending` with `pendingApproval` → `{ available: true, mode: "approval" }` (existing)
- `pending | ready` → `{ available: false, reason: "Task waiting for the runner to pick it up." }`
- `finalizing | pr-open` → `{ available: false, reason: "Task is finalizing. Reply will be available after merge or if it returns to needs-review." }`
- `merged | completed` → `{ available: false, reason: "Task is complete. Reply isn't supported in this state yet." }`
- `failed` → `{ available: true, mode: "feedback" }` — current behavior (POSTs `retry-task`)
- `cancelled` → `{ available: false, reason: "Task was cancelled." }`

When `available: false`: render the composer container with the textarea visible (pre-typed text isn't lost), the submit button disabled, and a small `<Banner tone="info">` showing `reason`. When `available: true`: existing rendering.

Drafts (`useDraftState`) keep working in either state — typed text stays put across navigation.

Remove the `disabled` short-circuit at `Composer.tsx:97` (the `return null`) — composer always renders.

### 10. Tests

**Engine:**
- `test/transport/transcript.test.ts` (new): GET endpoint with 0 / 1 / N runs; missing log file is skipped; malformed lines are skipped; events ordered by attempt then seq
- `test/transcript/stream-json-parser.test.ts` (new): parses each `ProviderEvent` kind correctly (assistant_text, thinking, tool_call, tool_result, permission_request, usage, error, final); returns null on garbage
- Update wherever `provider-event` is published to assert `seq` is included in payload (likely a small change to existing log-follow tests)

**PWA:**
- `pwa/src/views/__tests__/TranscriptView.test.tsx` (new): mount with empty buffer + history fetch returning N events → renders all N. Mount with live events arriving DURING fetch → both history and live are rendered, no duplicates
- `pwa/src/views/__tests__/TranscriptView.test.tsx`: SSE reconnect triggers re-fetch
- `pwa/src/components/__tests__/Composer.test.tsx`: extends existing tests — composer visible-but-disabled in `merged`/`completed`/etc. with the right reason text; submit button is `disabled`
- `pwa/src/views/__tests__/WorkflowDetail.test.tsx`: extends existing — transcript mounts when status is `merged` (not just `running`); composer mounts in all states

## Critical files to read/modify

**Engine (read first):**
- `src/persistence/subscriber-hub.ts:61-63,124-135` — current transient publish path
- `src/runtime/log-follow.ts` (or `src/plugins/tmux/log-follow.ts`) — where log lines are tailed and provider events are emitted; this is where `seq` originates
- `src/plugins/providers/claude-code.ts` — find `parseFrame()` to lift
- `src/domain/runs.ts` — `NodeRun.runtimeSessionId` is the link to the log path
- `src/plugins/tmux/tmux-runtime.ts:76` — log path construction (steal verbatim)
- `src/transport/server.ts` — current routes, idiom to follow

**Engine (modify):**
- `src/domain/events.ts:64-68` — extend `ProviderEventPayload`
- `src/transport/server.ts` — add transcript route
- New: `src/transcript/stream-json-parser.ts`
- Wherever provider events are published (subscriber-hub callsite) — attach `seq`

**PWA (read first):**
- `pwa/src/views/WorkflowDetail.tsx` — phase switch and provider-event fan-out
- `pwa/src/views/TranscriptView.tsx` — current pipeline
- `pwa/src/components/Composer.tsx` — `deriveMode` and gating
- `pwa/src/transcript/{aggregate,streaming}.ts` — pure pipeline (no changes expected)

**PWA (modify):**
- `pwa/src/transport/rest.ts` — add `getTaskTranscript`
- `pwa/src/domain/types.ts` (or new `transcript.ts`) — add `TranscriptEvent`, `TranscriptCursor`
- `pwa/src/views/TranscriptView.tsx` — refactor mount lifecycle
- `pwa/src/views/WorkflowDetail.tsx` — coexist layout
- `pwa/src/components/Composer.tsx` — always-visible-with-reason

## Verification

- `cd pwa && pnpm typecheck && pnpm build && pnpm test` — clean
- `npm test` (engine, with `MWF_HAS_GIT=1`) — clean (was 900/22 before; expect ~+10 from new tests)
- Dockerfile build clean (manual on a host with docker)

## Risks

1. **Long log files**: a multi-turn session can grow to MBs. First iteration returns the whole concat — UI may be slow on first paint. Mitigation: future pagination (`?fromRunId=&fromSeq=`); document as TODO in the endpoint.
2. **`seq` source-of-truth divergence**: live `seq` is line counter at emit time; transcript endpoint returns line number on read. If the publisher skips a line (parse failure mid-emit), live and replay disagree. Mitigation: emit live `seq` from the same `parseFrame` callsite that decides whether to publish — they share the line counter.
3. **Concurrent runs while page is open**: a `continue-task` spawns a new run with a new log. The PWA stays subscribed; new live events come in tagged with the new `runId` and append. The transcript history fetch happened on mount and doesn't include the new run's events — that's fine because they arrive live. If user reloads they'll see the full history including the new run. No re-fetch needed mid-session except on SSE reconnect (point #5 above).
4. **Stream-json format drift**: `parseFrame` lifted from claude-code provider — if the codex provider (or any future provider) writes a different format, the endpoint will silently drop their events. Mitigation: keep the parser provider-aware later; for now claude-code is the only provider that runs in dogfood.
5. **No auth on transcript endpoint**: same as the rest of the engine. Documented invariant; out of scope.
