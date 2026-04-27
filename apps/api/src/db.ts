import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const dbPath = path.join(config.dataDir, "pipeline.db");
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id            TEXT PRIMARY KEY,
    source_type   TEXT NOT NULL,
    source_ref    TEXT NOT NULL,
    image_tag     TEXT,
    container_id  TEXT,
    host          TEXT,
    internal_port INTEGER,
    status        TEXT NOT NULL,
    error         TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deployments_created ON deployments(created_at DESC);
`);

export type DeploymentStatus =
  | "queued"
  | "cloning"
  | "building"
  | "starting"
  | "running"
  | "failed"
  | "stopped";

export interface DeploymentRow {
  id: string;
  source_type: "git" | "upload";
  source_ref: string;
  image_tag: string | null;
  container_id: string | null;
  host: string | null;
  internal_port: number | null;
  status: DeploymentStatus;
  error: string | null;
  created_at: number;
  updated_at: number;
}

const insertStmt = db.prepare(`
  INSERT INTO deployments (id, source_type, source_ref, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE deployments SET
    image_tag     = COALESCE(?, image_tag),
    container_id  = COALESCE(?, container_id),
    host          = COALESCE(?, host),
    internal_port = COALESCE(?, internal_port),
    status        = COALESCE(?, status),
    error         = COALESCE(?, error),
    updated_at    = ?
  WHERE id = ?
`);
const getStmt = db.prepare(`SELECT * FROM deployments WHERE id = ?`);
const listStmt = db.prepare(`SELECT * FROM deployments ORDER BY created_at DESC LIMIT 200`);

export function createDeployment(input: {
  id: string;
  sourceType: "git" | "upload";
  sourceRef: string;
}) {
  const now = Date.now();
  insertStmt.run(input.id, input.sourceType, input.sourceRef, "queued", now, now);
  return getDeployment(input.id)!;
}

export function updateDeployment(
  id: string,
  patch: Partial<Omit<DeploymentRow, "id" | "created_at">>,
) {
  updateStmt.run(
    patch.image_tag ?? null,
    patch.container_id ?? null,
    patch.host ?? null,
    patch.internal_port ?? null,
    patch.status ?? null,
    patch.error ?? null,
    Date.now(),
    id,
  );
  return getDeployment(id)!;
}

export function getDeployment(id: string): DeploymentRow | undefined {
  return getStmt.get(id) as DeploymentRow | undefined;
}

export function listDeployments(): DeploymentRow[] {
  return listStmt.all() as DeploymentRow[];
}
