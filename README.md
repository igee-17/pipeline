# brimble-pipeline

A one-pager mini-PaaS — submit a Git URL or zip upload, watch a Railpack image get built, and see the running app served behind Caddy. Built as the take-home for Brimble's **Fullstack / Infra Engineer** role.

```
                ┌───────────────── docker compose up ─────────────────┐
                │                                                     │
   browser ──► caddy:80 ─► api:3001 ─► docker.sock                    │
                  │                       │                           │
                  │                       └─► buildkit (sidecar)      │
                  ▼                       │                           │
              app-<id> containers ◄───────┘                           │
                                                                      │
   web/static SPA served at /  ·  *.localhost ─► reverse_proxy app-<id>│
                └─────────────────────────────────────────────────────┘
```

## Stack

| Layer        | Choice                                                              |
|--------------|---------------------------------------------------------------------|
| UI           | Vite + React + TypeScript + TanStack Router + TanStack Query + Tailwind |
| API          | Node 22 + Hono + better-sqlite3 + dockerode + simple-git + execa    |
| Build        | [Railpack](https://railpack.com) talking to a BuildKit sidecar      |
| Runtime      | Docker (host daemon, via mounted socket)                            |
| Ingress      | Caddy 2 (static config + admin API for per-app routes)              |
| State        | SQLite (file on a named volume)                                     |
| Log streaming| **SSE** (no polling)                                                |

## Run it

Prereqs: **Docker Desktop** (or any Docker Engine) with Compose v2.

```bash
git clone <this-repo> brimble-pipeline
cd brimble-pipeline
docker compose up --build
```

Then open <http://localhost>.

That's the whole startup contract: one command, no host-side installs of Node, Caddy, or Railpack.

## Try it

1. Click **New deploy**.
2. Choose **Git URL** and paste any public repo Railpack can build, e.g.
   `https://github.com/railwayapp-templates/express-starter`.
3. Watch status walk `cloning → building → starting → running` while build + runtime logs stream live.
4. Click **Open ↗** — your browser will hit `http://<id>.localhost/` and Caddy will reverse-proxy to the new container.
5. **Stop** removes the route, kills the container, and marks the deployment stopped.

> `*.localhost` resolves to `127.0.0.1` automatically in Chrome, Firefox, Safari, and curl on modern OSes — no `/etc/hosts` edits needed.

## Architecture

### Five compose services

| Service      | What it does                                                                            |
|--------------|-----------------------------------------------------------------------------------------|
| `caddy`      | Single ingress on `:80`. Serves the SPA, proxies `/api/*` to the API, and gains per-deploy host routes via its admin API on `:2019`. |
| `api`        | The control plane — endpoints, DB, log pubsub, and the pipeline orchestrator.           |
| `buildkit`   | Standalone BuildKit daemon Railpack talks to over TCP.                                  |
| `web`        | One-shot builder: runs `vite build` and copies `dist/` into the `web_dist` named volume Caddy serves from. |
| (sqlite)     | Not a service — a file in the `api_data` named volume.                                  |

All five share one network so Caddy can resolve every running app container by name.

### Pipeline state machine

```
queued
  ├─► cloning   git clone (shallow) | unzip into /data/work/<id>
  ├─► building  railpack build <workdir> --name app-<id>:<sha>
  │              └─ Railpack pipes its docker exporter into `docker load`
  │                 so the image lands in the host daemon's image list.
  ├─► starting  dockerode createContainer + start, attached to apps network
  │              └─ caddy admin API: PUT /id/app-<id>  (host=<id>.localhost)
  └─► running   (terminal)
       failed   (terminal — error captured in DB + logged)
       stopped  (DELETE removed container + Caddy route)
```

### Real-time logs (no polling)

`GET /api/deployments/:id/logs` is an `EventSource` SSE stream:

1. The handler replays the on-disk log file for that deployment (so reloads still see history).
2. Then it subscribes to an in-process `EventEmitter` keyed by deployment id.
3. Build output (Railpack/BuildKit), runtime container logs (`dockerode.logs({follow:true})`), and pipeline state changes all funnel into the same stream, tagged by phase: `clone | build | runtime | system`.

Heartbeat events every 15s keep the connection through any proxies.

### Docker access

The API container mounts `/var/run/docker.sock`. `dockerode` and the `docker` CLI both talk to the host daemon. New app containers join `brimble-pipeline_apps` so Caddy can dial `app-<id>:<port>` by DNS.

> Mounting docker.sock = root on host. That's a real trade-off; for a take-home that's standard (Coolify, Dokploy, CapRover all do it). In production you'd front it with a [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) or use rootless Podman.

## API reference

| Method | Path                                | Purpose                                      |
|--------|-------------------------------------|----------------------------------------------|
| GET    | `/healthz`                          | Liveness                                     |
| GET    | `/api/deployments`                  | List recent deployments                      |
| POST   | `/api/deployments`                  | JSON `{ gitUrl }` **or** `multipart/form-data` with `file` (zip). Returns 201 with the row. |
| GET    | `/api/deployments/:id`              | Single deployment record                     |
| GET    | `/api/deployments/:id/logs`         | **SSE** — `event: log` with `{ ts, phase, line }` |
| DELETE | `/api/deployments/:id`              | Stop container + remove Caddy route          |

## Repo layout

```
.
├── apps/
│   ├── api/         # Hono + dockerode + railpack orchestration
│   │   └── src/
│   │       ├── server.ts
│   │       ├── routes/deployments.ts
│   │       ├── pipeline/{index,clone,build}.ts
│   │       ├── caddy.ts
│   │       ├── db.ts
│   │       ├── docker.ts
│   │       └── logs.ts
│   └── web/         # Vite + React + TanStack Router/Query
├── caddy/Caddyfile
├── docker-compose.yml
└── README.md
```

## Trade-offs and what I left out

- **Auth:** none. Single-tenant, local-only.
- **HTTPS:** HTTP-only on `*.localhost` is fine for the demo. In the deploy on Brimble below, Caddy auto-TLS would handle this.
- **Tests:** the rubric weights working software over coverage. I'd add `vitest` smoke tests on the routes and a fake-pipeline test for the state machine if shipping past v0.1.
- **Build cache:** whatever BuildKit does for free. No layer-cache export to a registry.
- **Concurrency:** pipelines run in-process (Promise-based). Real production = a queue + dedicated workers.
- **Multi-arch:** Railpack builds for the host's arch only. No `--platform` plumbing in the UI.

## Brimble deployment feedback

> _To be filled in after deploying this repo on the Brimble platform._
> _Section reserved per the take-home rubric. Will include screenshots,
> friction points, and what worked smoothly._

## Time spent

Roughly ~10 hours, end to end:

| Block                                              | Hours |
|----------------------------------------------------|-------|
| Repo scaffold, compose, Caddy static config        | 1.0   |
| API skeleton + DB + endpoints + SSE                | 2.0   |
| Pipeline (clone → railpack → docker run → caddy)   | 3.0   |
| Frontend SPA                                        | 2.0   |
| End-to-end debugging + Brimble deploy + README     | 2.0   |
