import { execa } from "execa";
import { config } from "../config.js";
import { appendLog } from "../logs.js";

export async function railpackBuild(opts: {
  deploymentId: string;
  workdir: string;
  imageTag: string;
}): Promise<void> {
  const { deploymentId, workdir, imageTag } = opts;
  appendLog(deploymentId, "build", `railpack build → ${imageTag}`);

  const child = execa(
    "railpack",
    ["build", workdir, "--name", imageTag, "--progress", "plain"],
    {
      env: {
        ...process.env,
        BUILDKIT_HOST: config.buildkitHost,
        DOCKER_HOST: "unix:///var/run/docker.sock",
      },
      stdio: ["ignore", "pipe", "pipe"],
      reject: false,
    },
  );

  const pump = (stream: NodeJS.ReadableStream | null) => {
    if (!stream) return;
    let buffer = "";
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) appendLog(deploymentId, "build", line);
      }
    });
    stream.on("end", () => {
      if (buffer.trim()) appendLog(deploymentId, "build", buffer);
    });
  };
  pump(child.stdout);
  pump(child.stderr);

  const result = await child;
  if (result.exitCode !== 0) {
    throw new Error(`railpack build failed (exit ${result.exitCode})`);
  }
  appendLog(deploymentId, "build", `built ${imageTag}`);
}
