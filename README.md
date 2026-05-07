# minions-workflow-core

Core workflow engine for the Minions system: domain types, runtime backends, persistence, and HTTP/SSE transport.

## Running with the Docker worker

The Docker worker is an isolated container (`minions-worker`) that runs tmux sessions on behalf of the host engine (`minionsd`). The host engine sends commands via `docker exec`; session logs land on a bind-mounted volume readable by both sides.

### Prerequisites

- Docker 24+
- `docker compose` v2+
- The host engine runs as uid 1001 (matching the container's `minions` user)

### 1. Build the image

```sh
docker build -t minions-worker:dev .
```

### 2. Create volumes and host bind directory

```sh
# Named volumes (persistent home, workspace, cache)
docker volume create minions-worker-home
docker volume create minions-worker-workspace
docker volume create minions-worker-cache

# Host data directory (engine appends /sessions internally)
sudo mkdir -p /var/lib/minions/sessions
```

### 3. Resolve uid/gid ownership for the sessions bind mount

The worker runs as uid/gid 1001 (`minions` user). The host engine writes session scripts and reads logs from `/var/lib/minions/sessions`. Both sides must have read/write access.

Run the host engine as uid 1001:

```sh
sudo useradd -u 1001 -m minionsd   # if the user doesn't exist yet
sudo chown 1001:1001 /var/lib/minions/sessions
# then run minionsd as uid 1001
```

### 4. Start the worker

```sh
docker compose up -d minions-worker
docker exec minions-worker tmux -V   # should print a tmux version
```

### 5. Authenticate CLI tools (one-time)

```sh
docker exec -it minions-worker claude /login
docker exec -it minions-worker codex login
```

Auth files persist in the `minions-worker-home` named volume across container restarts.

### 6. Configure minionsd

Set these environment variables before starting `minionsd`:

| Variable | Default | Description |
|---|---|---|
| `MWF_RUNTIME` | `local` | Set to `docker` to use the container worker |
| `MWF_DOCKER_CONTAINER` | `minions-worker` | Container name passed to `docker exec` |
| `MWF_DOCKER_WORKER_SESSIONS_DIR` | `/sessions` | Sessions directory path inside the container |
| `MWF_DOCKER_HOST_DATA_DIR` | `/var/lib/minions` | Host-side data root. The engine appends `/sessions` internally, so the bind mount in `docker-compose.yml` targets `/var/lib/minions/sessions:/sessions`. |

`minionsd` env-var wiring is applied in a future slice. For now, construct `TmuxRuntimeBackend` directly:

```ts
new TmuxRuntimeBackend({
  dataDir: process.env.MWF_DOCKER_HOST_DATA_DIR ?? "/var/lib/minions",
  workerSessionsDir: process.env.MWF_DOCKER_WORKER_SESSIONS_DIR ?? "/sessions",
  commandPrefix: ["docker", "exec", process.env.MWF_DOCKER_CONTAINER ?? "minions-worker"],
})
```

### 7. Smoke test

```sh
docker exec minions-worker tmux new-session -d -s smoke "echo hello"
docker exec minions-worker tmux wait-for -S smoke-done || true
docker exec minions-worker tmux kill-session -t smoke
```

### Container restart drill

Use this procedure to verify that `probe → "missing"` fires correctly after a container restart and that recovery rules produce the expected plan.

1. Start the worker: `docker compose up -d minions-worker`
2. Via the engine, start a session running `sleep 60`. Confirm `probe → "live"`.
3. Restart the container: `docker restart minions-worker`. Wait ~2 seconds.
4. Call `probe(sessionId)`. It must return `"missing"` — this is the load-bearing check.
5. Build a `RuntimeProbeMap` of `{ [sessionId]: "missing" }` and feed it to `planRecovery`. Assert that exactly one `interrupt-task` action is emitted with `reason` containing `"missing"`.
6. Apply recovery via `RecoveryService.scan`. The task transitions to `needs-review` (run closes with `terminalReason: "interrupted"`). The workflow remains `active` — `needs-review` is a terminal-for-engine state that requires operator intervention to resolve.
7. `docker start minions-worker` to restore the container for normal operation.

> **Operator path:** cancel the task with the `cancel-task` command to unblock the workflow. The `continue-task` command (slice 10) will be the resume path once the provider session ref is populated.

If step 4 returns anything other than `"missing"`, the slice is not correctly landed.

### Notes

- The sessions bind mount (`/var/lib/minions/sessions:/sessions`) should live on a local ext4/xfs filesystem. Stat-poll-based `fs.watchFile` works on NFS/SMB but with worse latency.
- The engine does **not** manage container lifecycle in v1. The operator is responsible for starting, stopping, and restarting `minions-worker`.
- Cross-host Docker (`DOCKER_HOST=tcp://...`) is not supported in v1.

## Workspace v2 (slice 14)

Slice 14 adds git worktree support via `GitWorktreeWorkspaceBackend`. The backend operates in two distinct modes depending on whether `gitCommandPrefix` is configured.

### Local mode (no `gitCommandPrefix`)

Paths are host-side. The engine calls `realpath` on `repoPath` and `workspaceRoot`, creates the workspace root directory if absent, and runs `git worktree add/remove` directly.

### Docker mode (`gitCommandPrefix` set)

The canonical git repo lives **inside the worker container**. The host engine drives git via `docker exec` (through `GitClient`'s `commandPrefix`). The host never touches container-internal paths with `fs`; all filesystem operations on worktree paths are routed through `DockerFs`, which shells out to `docker exec sh -c`.

**Operator setup for docker mode:**

1. Create and own the workspace bind-mount directory on the host:
   ```sh
   sudo mkdir -p /var/lib/minions/workspaces
   sudo chown 1001:1001 /var/lib/minions/workspaces
   export HOST_WORKSPACE_ROOT=/var/lib/minions/workspaces
   ```

2. Start the worker:
   ```sh
   docker compose up -d minions-worker
   ```

3. Clone the canonical repo **inside** the container:
   ```sh
   docker exec -it -u 1001 minions-worker git clone <url> /workspace/repo
   ```

4. Configure the engine:
   ```ts
   {
     repoPath: "/workspace/repo",          // container-internal path
     workspaceRoot: "/workspace/repo-worktrees",  // container-internal path
     gitCommandPrefix: ["docker", "exec", "-u", "1001", "minions-worker"],
   }
   ```

The `HOST_WORKSPACE_ROOT` bind mount (`${HOST_WORKSPACE_ROOT}:/workspace`) stays in `docker-compose.yml` so the operator can browse worktrees from the host. The engine treats `/workspace/repo` and `/workspace/repo-worktrees` as opaque container-internal paths and never realpaths or mkdirs them.

### New env var: `HOST_WORKSPACE_ROOT`

Before running `docker compose up`, set `HOST_WORKSPACE_ROOT` to the host directory that will be bind-mounted to `/workspace` inside the container:

```sh
export HOST_WORKSPACE_ROOT=/var/lib/minions/workspaces
sudo mkdir -p /var/lib/minions/workspaces
sudo chown 1001:1001 /var/lib/minions/workspaces
```

### Migration from named volume

If you previously ran with the named volume `minions-worker-workspace`, delete it after stopping the container:

```sh
docker compose down
docker volume rm minions-worker-workspace
```

Then set `HOST_WORKSPACE_ROOT` and bring the stack back up.

### How workspace mode is selected

`EngineConfig.repoPath` controls workspace backend selection:

| `repoPath` set? | `gitCommandPrefix` set? | `workspace` set? | Backend |
|---|---|---|---|
| No | — | No | `StubWorkspaceBackend` (no git ops) |
| Yes | No | No | `GitWorktreeWorkspaceBackend` — local mode (host paths, host fs) |
| Yes | Yes | No | `GitWorktreeWorkspaceBackend` — docker mode (container-internal paths, `docker exec` fs) |
| — | — | Yes | Provided backend (used as-is) |

`workspaceRoot` defaults to `${dirname(repoPath)}/${basename(repoPath)}-worktrees`.

## PWA usage

The engine serves the PWA shell from `pwa/` when `MWF_PWA_DIR` is set:

```sh
MWF_PWA_DIR=./pwa node dist/index.js
```

Then open `http://localhost:<port>/` in a browser (or on a phone on the same network). The shell lists active workflows at `GET /workflows`, lets you click into one to see the live transcript stream, and submit replies via the continue/fresh buttons.

### Icons

`pwa/icons/icon-192.png` and `pwa/icons/icon-512.png` are placeholders — a dark `#0f172a` background with a white "M" outline. Replace them with real branded assets before shipping to production. The manifest entries (`purpose: "any maskable"`) are correct; only the artwork needs replacement.

### Push notifications

When browsing a workflow, a banner prompts "Enable notifications". Clicking it:

1. Fetches the VAPID public key from `GET /push/vapid-public-key`.
2. Calls `Notification.requestPermission()`.
3. Subscribes via `pushManager.subscribe(...)`.
4. Posts the subscription to `POST /push/subscribe` alongside the workflow ID.

The service worker (`pwa/sw.js`) handles incoming `push` events and `notificationclick` events. Tapping a notification navigates the open PWA tab (via `postMessage`) or opens a new window at `/#/workflow/<id>`.

### Service worker caching

- **Hashed assets** (`/assets/`, `/icons/`): cache-first.
- **Navigation** (HTML): network-first, falls back to cached `/` on offline.
- **API routes** (`/workflows`, `/commands`, `/push`, `/sw.js`): pass-through (no caching).

Bump the `CACHE` constant in `pwa/sw.js` and the `app-v1.js` / `styles-v1.css` filename suffixes on deploy to force cache invalidation.

### What's deferred

- Real branded icons.
- PWA install prompt customization.
- Offline POST queue (replies drop when offline).
- Service worker unit tests (manual smoke only).
- E2E phone testing.
