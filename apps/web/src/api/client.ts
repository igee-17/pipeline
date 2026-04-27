export type DeploymentStatus =
  | "queued"
  | "cloning"
  | "building"
  | "starting"
  | "running"
  | "failed"
  | "stopped";

export interface Deployment {
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

const BASE = "/api";

export async function listDeployments(): Promise<Deployment[]> {
  const res = await fetch(`${BASE}/deployments`);
  if (!res.ok) throw new Error("failed to list deployments");
  const data = await res.json();
  return data.deployments;
}

export async function getDeployment(id: string): Promise<Deployment> {
  const res = await fetch(`${BASE}/deployments/${id}`);
  if (!res.ok) throw new Error("not found");
  const data = await res.json();
  return data.deployment;
}

export async function createGitDeployment(gitUrl: string): Promise<Deployment> {
  const res = await fetch(`${BASE}/deployments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gitUrl }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.deployment;
}

export async function createUploadDeployment(file: File): Promise<Deployment> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/deployments`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.deployment;
}

export async function stopDeployment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/deployments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
