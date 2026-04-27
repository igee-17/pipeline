import fs from "node:fs";
import { config } from "../config.js";
import { appendLog, closeLog } from "../logs.js";
import { getDeployment, updateDeployment } from "../db.js";
import { cloneFromGit, unpackUpload, workDir } from "./clone.js";
import { railpackBuild } from "./build.js";
import { ensureContainerStopped, inspectImagePort, startApp } from "../docker.js";
import { removeAppRoute, upsertAppRoute } from "../caddy.js";

export async function runPipeline(deploymentId: string, uploadPath?: string) {
  const dep = getDeployment(deploymentId);
  if (!dep) throw new Error(`deployment ${deploymentId} not found`);

  try {
    updateDeployment(deploymentId, { status: "cloning" });
    const sha =
      dep.source_type === "git"
        ? await cloneFromGit(deploymentId, dep.source_ref)
        : await unpackUpload(deploymentId, uploadPath!);

    const imageTag = `app-${deploymentId}:${sha}`;
    updateDeployment(deploymentId, { status: "building", image_tag: imageTag });
    await railpackBuild({
      deploymentId,
      workdir: workDir(deploymentId),
      imageTag,
    });

    const port = await inspectImagePort(imageTag);
    const host = `${deploymentId}.${config.publicHostSuffix}`;
    updateDeployment(deploymentId, {
      status: "starting",
      internal_port: port,
      host,
    });

    const { id: containerId, name } = await startApp({
      deploymentId,
      imageTag,
      port,
    });
    updateDeployment(deploymentId, { container_id: containerId });

    await upsertAppRoute({
      deploymentId,
      host,
      upstream: `${name}:${port}`,
    });

    updateDeployment(deploymentId, { status: "running" });
    appendLog(deploymentId, "system", `running at http://${host}`);

    if (uploadPath) fs.rmSync(uploadPath, { force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog(deploymentId, "system", `FAILED: ${msg}`);
    updateDeployment(deploymentId, { status: "failed", error: msg });
  }
}

export async function teardownDeployment(deploymentId: string) {
  await ensureContainerStopped(`app-${deploymentId}`).catch(() => {});
  await removeAppRoute(deploymentId).catch(() => {});
  appendLog(deploymentId, "system", "stopped");
  closeLog(deploymentId);
  updateDeployment(deploymentId, { status: "stopped" });
}
