import { config } from "./config.js";

const ADMIN = config.caddyAdminUrl;
const ADMIN_HEADERS = { Origin: ADMIN, "Content-Type": "application/json" };

interface CaddyRoute {
  "@id"?: string;
  match: Array<{ host: string[] }>;
  handle: Array<{
    handler: "reverse_proxy";
    upstreams: Array<{ dial: string }>;
  }>;
  terminal?: boolean;
}

interface CaddyServer {
  listen: string[];
  routes: CaddyRoute[];
}

const SERVER_ID = "srv0";
const SERVER_PATH = `/config/apps/http/servers/${SERVER_ID}`;

async function caddyFetch(method: string, path: string, body?: unknown) {
  const res = await fetch(`${ADMIN}${path}`, {
    method,
    headers: body !== undefined ? ADMIN_HEADERS : { Origin: ADMIN },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Caddy ${method} ${path} -> ${res.status} ${text}`);
  }
  return res;
}

async function getServer(): Promise<CaddyServer | null> {
  const res = await caddyFetch("GET", SERVER_PATH);
  if (res.status === 404) return null;
  return (await res.json()) as CaddyServer;
}

async function ensureBaseServer(): Promise<void> {
  const existing = await getServer();
  if (existing) return;
  const server: CaddyServer = { listen: [":80"], routes: [] };
  await caddyFetch("PUT", SERVER_PATH, server);
}

function routeId(deploymentId: string) {
  return `app-${deploymentId}`;
}

export async function upsertAppRoute(opts: {
  deploymentId: string;
  host: string;
  upstream: string;
}): Promise<void> {
  await ensureBaseServer();
  const id = routeId(opts.deploymentId);
  const route: CaddyRoute = {
    "@id": id,
    match: [{ host: [opts.host] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: opts.upstream }],
      },
    ],
    terminal: true,
  };

  // Fetch the current routes array, prepend this route (so it runs before
  // the Caddyfile-compiled catch-all at index 0), and PUT the whole array.
  // PATCH /id/<id> only does in-place replacement — it doesn't reorder,
  // so we always rebuild the array to guarantee the route is at the front.
  const server = await getServer();
  const routes: CaddyRoute[] = server?.routes ?? [];
  const filtered = routes.filter((r) => r["@id"] !== id);
  const updated = [route, ...filtered];
  await caddyFetch("PATCH", `${SERVER_PATH}/routes`, updated);
}

export async function removeAppRoute(deploymentId: string): Promise<void> {
  const id = routeId(deploymentId);
  const res = await fetch(`${ADMIN}/id/${id}`, {
    method: "DELETE",
    headers: { Origin: ADMIN },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Caddy delete route -> ${res.status} ${text}`);
  }
}
