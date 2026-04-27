# brimble-pipeline

A mini PaaS take-home for Brimble's Fullstack / Infra Engineer role. Submit a Git URL or zip, watch Railpack build the image, and hit the running app behind Caddy — all from a single `docker compose up`.

```
   browser
      │
   caddy:80 ──► /api/*  ──► api:3001 ──► docker.sock
      │                          │
      │                          ├──► buildkit (sidecar)
      ▼                          │
   app-<id>.localhost  ◄──────── └── docker run app-<id>:<sha>
      │
   web SPA at localhost/
```

## Stack

| Layer         | Choice                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| UI            | Vite + React + TypeScript + TanStack Router + TanStack Query + Tailwind |
| API           | Node 22 + Hono + better-sqlite3 + dockerode + simple-git + execa        |
| Image builds  | [Railpack](https://railpack.com) → BuildKit sidecar → `docker load`     |
| Runtime       | Docker (host daemon via mounted socket)                                 |
| Ingress       | Caddy 2 — static config + runtime routes via admin API                  |
| State         | SQLite on a named volume                                                |
| Log streaming | **SSE only** — no polling anywhere                                      |

## Run

Prereq: Docker Desktop (or Engine) with Compose v2. Nothing else needed on the host.

```bash
git clone https://github.com/igee-17/pipeline
cd pipeline
docker compose up --build
```

Open **http://localhost**.

## Try it

1. Click **New deploy**
2. Paste a public Git URL — e.g. `https://github.com/railwayapp-templates/expressjs`
3. Watch `queued → cloning → building → starting → running` with logs streaming live in the browser
4. Click **Open ↗** — your app is live at `http://<id>.localhost/` fronted by Caddy
5. **Stop** kills the container and removes the Caddy route

> `*.localhost` resolves to `127.0.0.1` in all modern browsers — no `/etc/hosts` edits needed.

## Architecture

### Services

| Service    | Role                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`    | Single ingress on `:80`. Serves the SPA, proxies `/api/*` to the API. Per-app host routes injected at runtime via Caddy admin API on `:2019`. |
| `api`      | Control plane — REST endpoints, SQLite state, log pubsub, pipeline orchestrator.                                                              |
| `buildkit` | Standalone BuildKit daemon Railpack talks to over TCP (`tcp://buildkit:1234`).                                                                |
| `web`      | One-shot builder: runs `vite build`, copies `dist/` into a named volume Caddy serves from.                                                    |

All services share one Docker network (`brimble-pipeline_apps`) so Caddy can resolve every app container by name.

### Pipeline state machine

```
queued
  └─► cloning   shallow git clone  |  unzip upload  →  /data/work/<id>
  └─► building  railpack build <dir> --name app-<id>:<sha>
                 Railpack uses BuildKit's docker exporter, pipes into `docker load`
                 so the image lands in the host daemon immediately
  └─► starting  dockerode creates + starts container on the apps network
                 Caddy admin API: PATCH /config → prepend host route for <id>.localhost
  └─► running   ← terminal
       failed   ← terminal (error in DB + streamed to UI)
       stopped  ← DELETE removed container + Caddy route
```

### Real-time logs (SSE, no polling)

`GET /api/deployments/:id/logs` opens an `EventSource` stream:

1. Replays the full on-disk log file for the deployment (history survives page reloads)
2. Subscribes to an in-process `EventEmitter` keyed by deployment ID
3. Build output (Railpack stdout/stderr), container runtime logs (`dockerode` `follow:true`), and pipeline state changes all stream through the same connection tagged by phase: `clone | build | runtime | system`
4. Heartbeat event every 15s keeps the connection alive through proxies

### Caddy route management

On startup the API re-registers Caddy routes for all `running` deployments, so a Caddy restart doesn't orphan live apps. New routes are **prepended** to the routes array (via `PATCH /config/apps/http/servers/srv0/routes`) so they evaluate before the Caddyfile-compiled SPA catch-all.

### Docker access

The API container mounts `/var/run/docker.sock`. Both `dockerode` and the `docker` CLI (used by Railpack's `docker load` step) talk to the host daemon. App containers join `brimble-pipeline_apps` so Caddy resolves them by name.

> Mounting docker.sock grants root-equivalent access to the host. Acceptable for a local take-home; in production use a socket proxy (e.g. Tecnativa docker-socket-proxy) or rootless Podman.

## API

| Method | Path                        | Description                                                   |
| ------ | --------------------------- | ------------------------------------------------------------- |
| GET    | `/healthz`                  | Liveness                                                      |
| GET    | `/api/deployments`          | List deployments                                              |
| POST   | `/api/deployments`          | JSON `{ gitUrl }` **or** multipart `file` (zip). Returns 201. |
| GET    | `/api/deployments/:id`      | Single record                                                 |
| GET    | `/api/deployments/:id/logs` | **SSE** stream — `event: log` with `{ ts, phase, line }`      |
| DELETE | `/api/deployments/:id`      | Stop container + remove Caddy route                           |

## Repo layout

```
apps/
  api/src/
    server.ts              Hono app + startup route restore
    config.ts
    db.ts                  SQLite schema + typed helpers
    logs.ts                File-backed log store + EventEmitter pubsub
    docker.ts              dockerode wrappers
    caddy.ts               Caddy admin API client
    routes/deployments.ts  REST + SSE handlers
    pipeline/
      index.ts             State machine orchestrator
      clone.ts             git clone + zip unpack
      build.ts             railpack build via execa
  web/src/
    routes/
      __root.tsx           Layout + nav
      index.tsx            Deployments list
      new.tsx              Git URL / zip upload form
      d.$id.tsx            Deployment detail + live log stream
    components/
      LogStream.tsx        EventSource-based log viewer
      StatusPill.tsx
caddy/Caddyfile
docker-compose.yml
```

## Trade-offs and design choices

- **Auth:** skipped — single-tenant local tool; adding it would be GitHub OAuth → JWT, scoped per project
- **HTTPS:** HTTP-only; `*.localhost` resolves without certs and is fine for the demo scope
- **Concurrency:** pipelines run in-process as fire-and-forget async tasks (`void runPipeline()`); fine for one user, wrong for production
- **Build cache:** whatever BuildKit provides for free per-layer; no explicit cache export to a registry between builds
- **Tests:** prioritised working software over coverage given the time constraint; the state machine and Caddy client are the highest-value targets for unit tests

## With more time

**I'd add:**

- A proper job queue (BullMQ or pg-boss) to replace the fire-and-forget `void runPipeline()` — concurrent builds on the same machine currently share CPU/memory with no backpressure
- Container health checks before marking `running`: poll the upstream until it responds before registering the Caddy route, so the "Open" button never 502s
- Log persistence across API restarts — currently a mid-build restart loses the in-flight log stream; easiest fix is tailing the file on reconnect, which the SSE handler already does for completed builds
- Build layer cache export to a local registry (`type=registry,ref=localhost:5000/cache/<id>`) so re-deploys of the same repo don't reinstall dependencies from scratch
- A `EXPOSE` / `PORT` inference pass before `docker run` — right now it defaults to 8080 and overrides with `PORT` env; some images ignore that

**I'd rip out:**

- The in-process `EventEmitter` log pubsub — it breaks the moment you run more than one API replica; replace with Redis pub/sub or a Postgres `LISTEN/NOTIFY` channel
- The mixed Caddyfile + admin API routing strategy — the Caddyfile compiles to a catch-all route that forces all dynamic routes to be prepended via `PATCH` to avoid being shadowed; cleaner to own the full Caddy config from the API on startup and drop the static Caddyfile entirely
- `simple-git` for cloning — it's fine, but shelling out to `git` directly via `execa` with `--filter=blob:none` for a true lazy clone would be faster for large repos

---

## Brimble Deployment Feedback

**Deployed:** https://pipeline.brimble.app

**Experience:**

Sign-up was smooth, but there's an OAuth gap I noticed: I authenticated with GitHub during sign-up, then got prompted to connect GitHub again when creating my first project. Not a blocker, but confusing because the two steps look identical and it's unclear why the first didn't already grant the required scope.

**GitHub repo access discoverability:** I granted access to one repo during initial OAuth. When I later tried to deploy a second project I couldn't find anywhere to expand that access — I had to know to search by repo name. A "manage repository access" link on the new-project screen would make this obvious.

Framework auto-detection didn't trigger after I changed the root directory to `apps/web`. I had to manually select the framework. Changing the root directory should re-run detection.

The deploy UI itself is clean. Progress is visible, the live URL appeared quickly, and the overall flow is easy to follow. That part felt polished.

**Critical bug — monorepo asset path resolution:** I deployed the frontend of the project with the root directory set to `apps/web` and got a black screen. Asset requests (`/assets/index-Cu1sJYd8.js`) were returning `Content-Type: text/html` with HTTP 200 — Brimble's SPA fallback was intercepting them. I isolated the root cause by deploying a standalone (flat-repo) Vite app to a separate project ([vite-test.brimble.app](https://vite-test.brimble.app)). That one works: the same asset path returns `Content-Type: text/javascript`. The black screen is therefore specific to the root-directory-override path: Brimble resolves built asset URLs relative to the repository root rather than the configured root directory, so the files are never found and the SPA catch-all fires instead. The SPA fallback should only activate for extensionless navigation paths, not for `.js` / `.css` / etc., and asset serving should be scoped to the configured root's `dist/` output.

Cloudflare Rocket Loader is also active on both deployments and mutates `type="module"` to a hash string (e.g. `type="67c9a96474ec609d623dc9d8-module"`), which breaks ES module loading. The flat-repo app recovers because the browser still loads the script via the `src` attribute before Rocket Loader intercepts. For the monorepo case the assets are already 404-ing as HTML, so Rocket Loader compounds the failure. Rocket Loader should be disabled by default for Brimble-managed deployments, or at minimum excluded from paths containing ES module entry points.

**Missing for infra use cases:** Brimble has no support for `docker-compose.yml` as a deployment unit, no privileged container access, and no way to mount the Docker socket — which means anything that orchestrates containers (this project, Coolify-style tools, build pipelines) can't run there. That's a significant gap if Brimble wants to go beyond frontend hosting and compete in the full-stack/infra space. The `brimble deploy --prod` CLI referenced on the homepage would also benefit from a proper monorepo story (a `brimble.json` manifest mapping services to root dirs).

## Time spent

~10 hours

| Block                                            | Hours |
| ------------------------------------------------ | ----- |
| Repo scaffold, compose, Caddy config             | 1.0   |
| API skeleton + DB + endpoints + SSE              | 2.0   |
| Pipeline (clone → railpack → docker run → caddy) | 3.0   |
| Frontend SPA                                     | 2.0   |
| End-to-end debugging + Brimble deploy + README   | 2.0   |
