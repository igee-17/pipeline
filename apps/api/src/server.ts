import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import pino from "pino";
import { config } from "./config.js";
import { deploymentsRouter } from "./routes/deployments.js";
import { listDeployments } from "./db.js";
import { upsertAppRoute } from "./caddy.js";

const log = pino({ name: "brimble-api" });

const app = new Hono();
app.use("*", logger());
app.use("*", cors());

app.get("/", (c) => c.json({ name: "brimble-pipeline-api", ok: true }));
app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/api/deployments", deploymentsRouter);

async function restoreRoutes() {
  const running = listDeployments().filter(
    (d) => d.status === "running" && d.host && d.container_id && d.internal_port,
  );
  for (const d of running) {
    try {
      await upsertAppRoute({
        deploymentId: d.id,
        host: d.host!,
        upstream: `app-${d.id}:${d.internal_port}`,
      });
      log.info({ id: d.id }, "restored caddy route");
    } catch (err) {
      log.warn({ id: d.id, err }, "failed to restore caddy route");
    }
  }
}

const server = serve(
  { fetch: app.fetch, port: config.port, hostname: "0.0.0.0" },
  (info) => {
    log.info(`api listening on :${info.port}`);
    void restoreRoutes();
  },
);

const shutdown = (signal: string) => {
  log.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
