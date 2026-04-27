import type { DeploymentStatus } from "../api/client";

export const STATUS_COLOR: Record<DeploymentStatus, string> = {
  queued:   "bg-zinc-700 text-zinc-100",
  cloning:  "bg-blue-700 text-blue-50",
  building: "bg-amber-700 text-amber-50",
  starting: "bg-violet-700 text-violet-50",
  running:  "bg-emerald-700 text-emerald-50",
  failed:   "bg-red-700 text-red-50",
  stopped:  "bg-zinc-800 text-zinc-300",
};

export const TERMINAL: DeploymentStatus[] = ["running", "failed", "stopped"];

export function isTerminal(s: DeploymentStatus) {
  return TERMINAL.includes(s);
}
