import path from "node:path";
import fs from "node:fs";
import simpleGit from "simple-git";
import unzipper from "unzipper";
import { config } from "../config.js";
import { appendLog } from "../logs.js";

const workRoot = path.join(config.dataDir, "work");
fs.mkdirSync(workRoot, { recursive: true });

export function workDir(id: string): string {
  return path.join(workRoot, id);
}

export async function cloneFromGit(id: string, gitUrl: string): Promise<string> {
  const dest = workDir(id);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  appendLog(id, "clone", `Cloning ${gitUrl}`);
  const git = simpleGit({
    progress: ({ method, stage, progress }) => {
      appendLog(id, "clone", `${method} ${stage}: ${progress}%`);
    },
  });

  await git.clone(gitUrl, dest, ["--depth", "1"]);
  const head = await simpleGit(dest).revparse(["HEAD"]);
  appendLog(id, "clone", `Cloned at ${head.trim()}`);
  return head.trim().slice(0, 7);
}

export async function unpackUpload(
  id: string,
  zipPath: string,
): Promise<string> {
  const dest = workDir(id);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  appendLog(id, "clone", `Unpacking upload`);
  await fs
    .createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: dest }))
    .promise();

  // If the zip contains a single top-level dir, flatten it.
  const entries = fs.readdirSync(dest);
  if (entries.length === 1) {
    const inner = path.join(dest, entries[0]);
    if (fs.statSync(inner).isDirectory()) {
      for (const e of fs.readdirSync(inner)) {
        fs.renameSync(path.join(inner, e), path.join(dest, e));
      }
      fs.rmdirSync(inner);
    }
  }
  appendLog(id, "clone", `Upload ready at ${dest}`);
  return "upload";
}
