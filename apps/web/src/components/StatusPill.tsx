import type { DeploymentStatus } from "../api/client";
import { STATUS_COLOR } from "../lib/status";

export function StatusPill({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}
    >
      {status}
    </span>
  );
}
