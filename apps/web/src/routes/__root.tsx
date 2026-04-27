import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            <span className="text-emerald-400">brimble</span>
            <span className="text-zinc-400">/pipeline</span>
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link
              to="/"
              className="text-zinc-300 hover:text-white"
              activeProps={{ className: "text-white font-medium" }}
            >
              Deployments
            </Link>
            <Link
              to="/new"
              className="rounded bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500"
            >
              New deploy
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-zinc-900 py-4 text-center text-xs text-zinc-600">
        brimble-pipeline · take-home demo
      </footer>
    </div>
  );
}
