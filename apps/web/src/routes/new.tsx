import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createGitDeployment, createUploadDeployment } from "../api/client";

export const Route = createFileRoute("/new")({
  component: NewDeployment,
});

type Mode = "git" | "upload";

function NewDeployment() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("git");
  const [gitUrl, setGitUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const dep =
        mode === "git"
          ? await createGitDeployment(gitUrl.trim())
          : await createUploadDeployment(file!);
      void navigate({ to: "/d/$id", params: { id: dep.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    ((mode === "git" && /^https?:\/\//.test(gitUrl.trim())) ||
      (mode === "upload" && !!file));

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New deployment</h1>
        <p className="text-sm text-zinc-400">
          Source code → Railpack image → running container, fronted by Caddy.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-zinc-800 p-0.5">
        {(["git", "upload"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-sm rounded ${
              mode === m
                ? "bg-emerald-600 text-white"
                : "text-zinc-300 hover:text-white"
            }`}
          >
            {m === "git" ? "Git URL" : "Upload zip"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "git" ? (
          <div className="space-y-1">
            <label className="text-sm text-zinc-300">Repository URL</label>
            <input
              type="url"
              required
              placeholder="https://github.com/railwayapp-templates/express-starter"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <p className="text-xs text-zinc-500">
              Public repos only. Cloned shallow.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-sm text-zinc-300">Zip file</label>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-white"
            />
          </div>
        )}

        {error && <div className="text-sm text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Deploy"}
        </button>
      </form>
    </div>
  );
}
