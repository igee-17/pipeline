import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listDeployments } from "../api/client";
import { StatusPill } from "../components/StatusPill";

export const Route = createFileRoute("/")({
  component: DeploymentsList,
});

function timeAgo(ms: number) {
  const d = Math.max(0, Date.now() - ms);
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DeploymentsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["deployments"],
    queryFn: listDeployments,
    refetchInterval: 4000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Deployments</h1>
          <p className="text-sm text-zinc-400">
            Real builds via Railpack, fronted by Caddy on <code>*.localhost</code>.
          </p>
        </div>
      </div>

      {isLoading && <div className="text-zinc-400">loading…</div>}
      {error && <div className="text-red-400">failed to load</div>}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Image</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No deployments yet —
                  <Link to="/new" className="ml-1 text-emerald-400 hover:underline">
                    deploy something
                  </Link>
                </td>
              </tr>
            )}
            {(data ?? []).map((d) => (
              <tr key={d.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                <td className="px-4 py-2 font-mono text-zinc-200">{d.id}</td>
                <td className="px-4 py-2 truncate max-w-[24ch] text-zinc-300">
                  {d.source_ref}
                </td>
                <td className="px-4 py-2"><StatusPill status={d.status} /></td>
                <td className="px-4 py-2 font-mono text-zinc-400">
                  {d.image_tag ?? "—"}
                </td>
                <td className="px-4 py-2 text-zinc-400">{timeAgo(d.created_at)}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to="/d/$id"
                    params={{ id: d.id }}
                    className="text-emerald-400 hover:underline"
                  >
                    open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
