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
5. Build a `RuntimeProbeMap` of `{ [sessionId]: "missing" }` and feed it to `planRecovery` (or `applyRecoveryRules`). Assert that exactly one `recover-task` action is emitted with `reason` containing `"missing"`.
6. `docker start minions-worker` to restore the container for normal operation.

If step 4 returns anything other than `"missing"`, the slice is not correctly landed.

### Notes

- The sessions bind mount (`/var/lib/minions/sessions:/sessions`) should live on a local ext4/xfs filesystem. Stat-poll-based `fs.watchFile` works on NFS/SMB but with worse latency.
- The engine does **not** manage container lifecycle in v1. The operator is responsible for starting, stopping, and restarting `minions-worker`.
- Cross-host Docker (`DOCKER_HOST=tcp://...`) is not supported in v1.
