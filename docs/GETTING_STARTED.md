# Getting started — clean room to phone-driven workflow

End-to-end walkthrough: start with nothing, end with a workflow you can drive from your phone that opens a real PR against a real repo.

Time budget: ~30 minutes if you have everything ready, ~90 minutes from scratch.

---

## What you need before you start

| Thing | Why |
|---|---|
| A Linux box reachable from your phone | Engine + worker run here. Home server, Tailscale-connected laptop, or a cheap cloud VM all work. |
| Docker + Docker Compose | Worker container + isolated git operations |
| Node.js 20+ | Engine runtime |
| A GitHub fine-grained PAT | Engine uses it to push branches and open PRs |
| A target GitHub repo | The repo the engine will operate against |
| Either Claude Code CLI or Codex CLI access | The actual AI agent that does the work. The worker container ships with placeholders, but you authenticate them at runtime. |
| HTTPS reachability from your phone | Web push requires HTTPS. Tailscale + a self-signed reverse proxy is the simplest path. |

---

## 1. Clone

```sh
git clone https://github.com/tprei/minions.git
cd minions
npm ci
```

---

## 2. Generate VAPID keys (one time)

Web push needs a stable VAPID keypair. Generate once, save in your secret store.

```sh
npx web-push generate-vapid-keys
```

Output looks like:

```
Public Key:
BJ7…
Private Key:
5b…
```

Save both. The public key also goes into the PWA service worker the first time the browser subscribes — but the engine reads them at boot, so you only need to copy them into your env file.

---

## 3. Create a fine-grained GitHub PAT

[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

- **Repository access**: only the repo you want the engine to operate against (or a small allowlist).
- **Permissions** (read + write where applicable):
  - Contents: Read and write
  - Pull requests: Read and write
  - Workflows: Read and write (only needed if you're going to touch `.github/workflows/`)
  - Metadata: Read (auto)
- Save the token; you only see it once.

---

## 4. Build the worker image

The worker is a sandboxed container that runs `tmux` + the AI CLI tools. The engine talks to it via `docker exec`.

```sh
docker build -t minions-worker:dev -f Dockerfile .
```

---

## 5. Configure environment

Make a `.env` next to the repo. **Do not commit it.**

```sh
# Engine
MWF_PORT=3000
MWF_DB_PATH=/var/lib/minions/engine.db
MWF_DATA_DIR=/var/lib/minions
MWF_PWA_DIR=./pwa
MWF_LOG_LEVEL=info
MWF_PROVIDER=claude-code           # or codex

# Workspace (where worktrees go; needs to be readable by both host and container)
MWF_REPO_PATH=/var/lib/minions/repo.git           # bare repo we operate against
MWF_WORKSPACE_ROOT=/var/lib/minions/workspaces
HOST_WORKSPACE_ROOT=/var/lib/minions/workspaces   # used by docker-compose.yml

# Worker
MWF_DOCKER_CONTAINER=minions-worker
MWF_DOCKER_WORKER_SESSIONS_DIR=/sessions
MWF_DOCKER_HOST_DATA_DIR=/var/lib/minions

# GitHub
MWF_GITHUB_TOKEN=ghp_…
MWF_GITHUB_REPO_OWNER=tprei
MWF_GITHUB_REPO_NAME=your-target-repo
MWF_GITHUB_BASE_BRANCH=main

# Web push (VAPID)
MWF_VAPID_PUBLIC_KEY=BJ7…
MWF_VAPID_PRIVATE_KEY=5b…
MWF_VAPID_SUBJECT=mailto:you@example.com
```

Create the data directories with the right permissions:

```sh
sudo mkdir -p /var/lib/minions/{sessions,workspaces}
sudo chown -R "$(id -u):$(id -g)" /var/lib/minions
```

Clone the target repo as a bare repo at `MWF_REPO_PATH`:

```sh
git clone --bare https://github.com/tprei/your-target-repo.git "$MWF_REPO_PATH"
```

---

## 6. Start the worker

```sh
docker compose --env-file .env up -d minions-worker
```

Verify it's running:

```sh
docker compose ps
docker exec minions-worker tmux -V
```

---

## 7. Authenticate the AI CLI inside the worker (one time)

For Claude Code:

```sh
docker exec -it minions-worker claude /login
```

For Codex:

```sh
docker exec -it minions-worker codex login
```

The token is stored inside the worker's home volume and survives container restarts.

---

## 8. Start the engine

```sh
set -a; source .env; set +a
npm start
```

You should see:

```
{"t":"…","lvl":"info","msg":"engine started","service":"engine","kind":"engine-lifecycle","phase":"started"}
{"t":"…","lvl":"info","msg":"boot complete","service":"engine","kind":"engine-lifecycle","phase":"boot-complete",…}
minions-engine listening on http://0.0.0.0:3000
```

Smoke test from another shell:

```sh
curl http://localhost:3000/workflows
# → []
```

---

## 9. Make HTTPS reachable from your phone

Web push will not work over plain HTTP. Pick one:

### Option A — Tailscale + Caddy (recommended)

```sh
# On your engine host
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Note the magic name shown (e.g. lemon-pie.tailnet-abc.ts.net)

# Install Caddy
sudo apt install -y caddy

# /etc/caddy/Caddyfile
lemon-pie.tailnet-abc.ts.net {
  reverse_proxy localhost:3000
}

sudo systemctl restart caddy
```

Tailscale issues a real Let's Encrypt cert via DNS-01. On your phone, install Tailscale, log in to the same tailnet, and the magic name resolves with HTTPS.

### Option B — ngrok (quick + dirty)

```sh
ngrok http 3000
# → https://abc123.ngrok.app forwarding to http://localhost:3000
```

URL changes per session. Fine for a smoke test, not for daily use.

### Option C — Cloudflare Tunnel

[Free tier](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) works the same as ngrok but with a stable subdomain.

---

## 10. Open the PWA on your phone

1. Open `https://your-engine-host/` in mobile Chrome or Safari.
2. Tap the share menu → **Add to Home Screen**.
3. Open the PWA from your home screen (must be standalone for push notifications to fire reliably).
4. The first time you tap the **Enable notifications** banner, the browser prompts for push permission.
5. Subscription POSTs to the engine; you'll see it in the engine logs.

---

## 11. Create your first workflow

From your phone (or `curl` from your laptop):

```sh
curl -X POST https://your-engine-host/workflows \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "wf-hello-1",
    "kind": "single-task",
    "tasks": [{
      "id": "wf-hello-1:task",
      "title": "Add a hello-world README badge",
      "prompt": "Add a CI badge to README.md pointing at GitHub Actions for this repo. Commit on a new branch."
    }],
    "policy": {"maxConcurrent": 1, "autoLand": true, "autoMergeOnGreen": false}
  }'
```

What you should see:

1. Engine logs: workflow created, task transitions `pending → ready → running`.
2. Worker container starts a tmux session, runs the AI CLI, agent does its work.
3. Task transitions `running → completed → quality-pending → finalizing` (quality runs if `.minions/quality.json` exists in the target repo).
4. CompletionDispatcher fires `MergeService.openOnly` (because `autoLand: true`).
5. Task transitions `finalizing → pr-open`. A real PR appears on GitHub.
6. CIBabysitter starts polling check runs.
7. Push notification arrives on your phone when the task hits `pr-open` (and again on any `merge-conflict`).

If `autoMergeOnGreen` were `true`, the engine would also squash-merge on green CI without your involvement.

---

## 12. Common operations

| Want to | Do |
|---|---|
| Send a follow-up message to a task in `needs-review` | PWA reply box, or `POST /commands { kind:"continue-task", workflowId, taskId, prompt }` |
| Force a fresh retry (no resume) | `POST /commands { kind:"retry-task", workflowId, taskId, prompt }` |
| Trigger merge manually | `POST /workflows/:id/tasks/:taskId/merge` |
| See audit log | `GET /audit/events?workflowId=…` |
| See alerts | `GET /alerts` |
| Subscribe to engine-wide alerts (separate from per-workflow) | `POST /alerts/subscribe { subscription }` |

---

## 13. Keeping it running

Run the engine as a `systemd` service so it survives reboots:

```ini
# /etc/systemd/system/minions-engine.service
[Unit]
Description=Minions workflow engine
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=prei
WorkingDirectory=/home/prei/minions
EnvironmentFile=/home/prei/minions/.env
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now minions-engine
journalctl -u minions-engine -f
```

The supervisor sidecar (slice 23) writes structured JSON to stdout; pipe it to `jq` or set `MWF_LOG_FILE=/var/log/minions.jsonl` to keep a durable copy.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MWF_HAS_GIT must be set` errors during `npm test` | running tests outside `MWF_HAS_GIT=1` | `MWF_HAS_GIT=1 npm test` (covers integration tests) |
| Worker container can't see the worktrees | bind mount path mismatch | confirm `HOST_WORKSPACE_ROOT` (compose) and `MWF_WORKSPACE_ROOT` (engine) point to the same dir |
| Push notifications never arrive on phone | not HTTPS, or VAPID key changed | confirm browser console shows successful subscribe; check engine logs for `push send failed` |
| Task stuck in `pr-open` and never merges with `autoMergeOnGreen: true` | CI never reports completed runs to GitHub | confirm GitHub Actions is enabled for the target repo |
| Task stuck in `finalizing` | `autoLand: false` and you haven't called `/merge` | post the merge command, or set the policy on next workflow |
| `MERGE INCONSISTENCY` log line | GitHub merged but the engine's local transition failed | see `alerts` table — supervisor escalated this. Inspect, manually mark `merged` if needed |
| Tests fail with `TypeError: ... .kill is not a function` in WSL2 | `child_process.kill` quirk | already handled in `HostCommandRunner`; report if it recurs |

---

## What lives where

```
src/
  domain/        # types, transitions, workflow construction
  application/   # services: orchestrator, services, recovery, merge, quality, completion-dispatcher, ci-babysitter
  observability/ # Logger + Sink + ObservabilityService
  supervisor/    # audit projection + 5 anomaly rules + alert notifier
  persistence/   # SQLite repo + subscriber hub
  plugins/       # tmux runtime, providers, workspace, github SCM, runners
  transport/     # Hono server, validators, SSE, REST
  main.ts        # CLI entry point (added for the smoke setup)

pwa/             # phone-as-controller PWA (Telegraph Console design)
test/            # unit + integration (MWF_HAS_GIT=1 enables real-git tests)
```

Read `README.md` for component-level notes (Docker worker, Workspace v2, PWA, push). Read individual slice headers in commit messages for design decisions.

---

## When something feels wrong

The supervisor (slice 23) tracks 5 anomaly classes:

- `merge-inconsistent` — github merged but local state didn't (operator must reconcile)
- `push-failures-spike` — > 5 push failures / 60s (web push provider degraded)
- `boot-recovery-failed` — engine restarted but couldn't rehydrate some workflows
- `orchestrator-silent` — running task with no events for 30+ minutes (worker probably dead)
- `ci-exhausted` — CI fix loop hit cap; operator needed

These fire to your phone (if subscribed via `/alerts/subscribe`) and persist in the `alerts` table for `GET /alerts`.

If you're getting lost: `tail -f /var/log/minions.jsonl | jq 'select(.lvl != "debug")'` shows the live structured stream.
