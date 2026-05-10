# PWA dev guide

## Architecture overview

The frontend is a React 18 + Vite 5 + TypeScript strict PWA located under `pwa/`. State lives in Zustand stores fed by a REST + SSE transport layer; the SSE stream uses a `?since=` cursor so the client backfills any events missed while offline. The service worker is built with vite-plugin-pwa in `injectManifest` mode — you own the SW source at `pwa/src/sw/sw.ts` rather than relying on a generated Workbox precache-only script. Tailwind 3 provides design tokens via CSS variables. In production, the engine serves the built bundle from the path set in `MWF_PWA_DIR`; in local dev, Vite's dev server proxies API calls to the engine.

## Local dev workflow

You need two terminals.

**Terminal 1 — engine**

```
MWF_DB_PATH=./dev.db MWF_REPO_PATH=$HOME/path/to/some/repo npm start
```

The engine listens on port 3000 by default (`MWF_PORT` overrides it).

**Terminal 2 — PWA dev server**

```
cd pwa && pnpm dev
```

The dev server runs on port 5173 and proxies all API paths (`/workflows`, `/commands`, `/audit`, `/alerts`, `/push`, `/github`) to `http://localhost:3000`.

Open `http://localhost:5173` in your browser.

## Provider setup

`MWF_PROVIDER` selects the agent backend. Valid values:

| Value | Backend |
|---|---|
| `claude-code` (default) | Claude Code CLI |
| `codex` | OpenAI Codex CLI |
| `stub` | In-process stub (no real agent; useful for UI-only dev) |

`MWF_REPO_PATH` must point at a bare git repository that the engine can push branches into. If you omit it, the engine starts but git-dependent operations fail.

Provider credentials follow each tool's convention: `~/.claude` for claude-code, `~/.codex` for Codex CLI.

## PWA install + push (HTTPS required)

Browser push notifications and the PWA install prompt both require a secure origin. HTTP localhost works for install during development, but iOS Safari requires real TLS for push.

The simplest path for real-device testing is a Cloudflare Tunnel:

```
cloudflared tunnel --url http://localhost:3000
```

This gives you a `https://*.trycloudflare.com` URL you can open on your phone. The `cloudflared` service in `docker-compose.deploy.yml` does the same thing in production using a named tunnel and `CLOUDFLARE_TUNNEL_TOKEN`.

Tailscale alone does not terminate TLS for arbitrary hostnames, so push subscriptions will be rejected on iOS even if the device is on the same Tailnet.

## Layout of `pwa/src/`

```
pwa/src/
  transport/     REST client (rest.ts) + SSE client (sse.ts)
  store/         Zustand stores (one per domain: workflow, task, audit, cost, alerts, connection)
  domain/        Local type mirrors — types are duplicated here rather than imported from the
                 engine, keeping the PWA standalone
  views/         Page-level components (WorkflowList, WorkflowDetail, ActivityTab, PrTab, …)
  components/    Reusable atoms (Button, Sheet, Composer, CommandPalette, CompletionStepper, …)
  hooks/         Gesture + theme hooks (useLongPress, useSwipeUp, useTheme, useMediaQuery, …)
  transcript/    Provider-event aggregation (aggregate.ts) + per-kind renderers under events/
  artifacts/     Per-artifact-kind renderers (Branch, Patch, Pr, CiReport, QualityReport, …)
  pwa/           Push subscription, install prompt, offline helpers
  sw/            Custom service worker — notificationclick deep-link handler
  utils/         Agent color identity (agentColor.ts), FNV-1a city alias (cityAlias.ts)
  util/          Single-function utilities (cx.ts — class name helper)
  routing/       Hash router (router.ts, parseUrl.ts)
```

## Where dogfood artifacts land

- **Workflow DB**: `MWF_DB_PATH` — a SQLite file on the engine host
- **Provider sessions**: `~/.claude` (claude-code), `~/.codex` (codex), none (stub)
- **PWA cache**: browser storage managed by vite-plugin-pwa / the service worker — survives page reloads, cleared by unregistering the SW or calling `caches.delete()`

## Testing

**PWA unit + integration (vitest + happy-dom + @testing-library/react)**

```
cd pwa && pnpm test
```

**Engine unit + integration**

```
npm test
```

**E2E (Playwright — requires a built PWA bundle)**

```
cd pwa && pnpm build
npx playwright test
```

The E2E suite starts the engine in-process, serves the built bundle, and drives Chromium. Screenshot baselines live under `e2e/<spec>.spec.ts-snapshots/`.

## Troubleshooting

**Stale service worker**

Bump the cache version string in `pwa/src/sw/sw.ts`, or open DevTools → Application → Service Workers → Unregister, then hard-reload.

**SSE not reconnecting**

Open the Network tab and look for the `/workflows/stream` request. It should carry a `?since=<cursor>` query param on reconnect. If the cursor is missing, check that `useConnectionStore` is writing `lastEventId` on each received event. Check the engine log for the `last-event-id` header value it sees.

**Drafts not persisting between sessions**

The composer draft is stored in `localStorage` under the key `draft:<workflowId>`. Inspect it with:

```
localStorage.getItem("draft:<your-workflow-id>")
```

Clear a stuck draft with `localStorage.removeItem("draft:<your-workflow-id>")`.
