import Docker from "dockerode";
import { config } from "./config.js";
import { appendLog } from "./logs.js";

export const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function inspectImagePort(imageTag: string): Promise<number> {
  try {
    const img = await docker.getImage(imageTag).inspect();
    const exposed = img.Config?.ExposedPorts ?? {};
    for (const key of Object.keys(exposed)) {
      const [p] = key.split("/");
      const n = Number(p);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    // ignore
  }
  return config.appPort;
}

export async function ensureContainerStopped(name: string) {
  try {
    const c = docker.getContainer(name);
    const info = await c.inspect();
    if (info.State.Running) await c.stop({ t: 5 }).catch(() => {});
    await c.remove({ force: true }).catch(() => {});
  } catch {
    // not found - fine
  }
}

export async function startApp(opts: {
  deploymentId: string;
  imageTag: string;
  port: number;
}): Promise<{ id: string; name: string }> {
  const name = `app-${opts.deploymentId}`;
  await ensureContainerStopped(name);

  const container = await docker.createContainer({
    name,
    Image: opts.imageTag,
    Env: [`PORT=${opts.port}`, `HOST=0.0.0.0`, `NODE_ENV=production`],
    ExposedPorts: { [`${opts.port}/tcp`]: {} },
    HostConfig: {
      NetworkMode: config.appsNetwork,
      RestartPolicy: { Name: "on-failure", MaximumRetryCount: 3 },
    },
    Labels: {
      "brimble-pipeline.deployment": opts.deploymentId,
      "brimble-pipeline.managed": "true",
    },
  });
  await container.start();

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 0,
  });
  stream.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) appendLog(opts.deploymentId, "runtime", line);
    }
  });
  stream.on("end", () => {
    appendLog(opts.deploymentId, "runtime", "[runtime stream ended]");
  });

  return { id: container.id, name };
}
