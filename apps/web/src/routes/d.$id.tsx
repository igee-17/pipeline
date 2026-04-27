import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDeployment, stopDeployment } from "../api/client";
import { StatusPill } from "../components/StatusPill";
import { LogStream } from "../components/LogStream";
import { isTerminal } from "../lib/status";

export const Route = createFileRoute("/d/$id")({
  component: DeploymentDetail,
});

function DeploymentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: dep, isLoading } = useQuery({
    queryKey: ["deployment", id],
    queryFn: () => getDeployment(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status && isTerminal(status) ? false : 2000;
    },
  });

  const stop = useMutation({
    mutationFn: () => stopDeployment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deployment", id] }),
  });

  if (isLoading) return <div className="text-zinc-400">loading…</div>;
  if (!dep) return <div className="text-red-400">deployment not found</div>;

  const liveUrl = dep.host ? `http://${dep.host}/` : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ to: "/" })}
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← all deployments
          </button>
          <h1 className="mt-1 font-mono text-xl">{dep.id}</h1>
          <p className="text-sm text-zinc-400 truncate max-w-[60ch]">
            {dep.source_ref}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={dep.status} />
          {liveUrl && dep.status === "running" && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
            >
              Open ↗
            </a>
          )}
          {dep.status !== "stopped" && dep.status !== "failed" && (
            <button
              onClick={() => stop.mutate()}
              disabled={stop.isPending}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {stop.isPending ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-y-2 gap-x-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <dt className="text-zinc-400">Source type</dt>
        <dd className="font-mono">{dep.source_type}</dd>
        <dt className="text-zinc-400">Image tag</dt>
        <dd className="font-mono">{dep.image_tag ?? "—"}</dd>
        <dt className="text-zinc-400">Host</dt>
        <dd className="font-mono">
          {liveUrl ? (
            <a href={liveUrl} className="text-emerald-400 hover:underline" target="_blank" rel="noreferrer">
              {dep.host}
            </a>
          ) : "—"}
        </dd>
        <dt className="text-zinc-400">Internal port</dt>
        <dd className="font-mono">{dep.internal_port ?? "—"}</dd>
        {dep.error && (
          <>
            <dt className="text-zinc-400">Error</dt>
            <dd className="text-red-400 break-all">{dep.error}</dd>
          </>
        )}
      </dl>

      <LogStream deploymentId={id} />
    </div>
  );
}
