import path from "node:path";
import fs from "node:fs";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { config } from "../config.js";
import {
  createDeployment,
  getDeployment,
  listDeployments,
} from "../db.js";
import { runPipeline, teardownDeployment } from "../pipeline/index.js";
import { streamLogs } from "../logs.js";

const uploadsDir = path.join(config.dataDir, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

export const deploymentsRouter = new Hono();

const gitBody = z.object({ gitUrl: z.string().url() });

function shortId() {
  return createId().slice(0, 10).toLowerCase();
}

deploymentsRouter.get("/", (c) => c.json({ deployments: listDeployments() }));

deploymentsRouter.post("/", async (c) => {
  const ctype = c.req.header("content-type") ?? "";
  let id = shortId();

  if (ctype.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) {
      return c.json({ error: "file field required" }, 400);
    }
    const dest = path.join(uploadsDir, `${id}.zip`);
    const ab = await file.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(ab));
    const dep = createDeployment({
      id,
      sourceType: "upload",
      sourceRef: file.name || "upload.zip",
    });
    void runPipeline(id, dest);
    return c.json({ deployment: dep }, 201);
  }

  const json = await c.req.json().catch(() => null);
  const parsed = gitBody.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: "expected { gitUrl } JSON body or multipart file" }, 400);
  }
  const dep = createDeployment({
    id,
    sourceType: "git",
    sourceRef: parsed.data.gitUrl,
  });
  void runPipeline(id);
  return c.json({ deployment: dep }, 201);
});

deploymentsRouter.get("/:id", (c) => {
  const dep = getDeployment(c.req.param("id"));
  if (!dep) return c.json({ error: "not found" }, 404);
  return c.json({ deployment: dep });
});

deploymentsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const dep = getDeployment(id);
  if (!dep) return c.json({ error: "not found" }, 404);
  await teardownDeployment(id);
  return c.json({ ok: true });
});

deploymentsRouter.get("/:id/logs", (c) => {
  const id = c.req.param("id");
  if (!getDeployment(id)) return c.json({ error: "not found" }, 404);

  return streamSSE(c, async (stream) => {
    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });

    const unsubscribe = streamLogs(id, (entry) => {
      if (closed) return;
      void stream.writeSSE({
        event: "log",
        data: JSON.stringify(entry),
      });
    });

    // Heartbeat every 15s so proxies don't kill the stream.
    while (!closed) {
      await stream.sleep(15_000);
      if (closed) break;
      await stream.writeSSE({ event: "ping", data: String(Date.now()) });
    }
    unsubscribe();
  });
});
