import { useEffect, useRef, useState } from "react";

interface LogEntry {
  ts: number;
  phase: "system" | "clone" | "build" | "runtime";
  line: string;
}

const PHASE_COLOR: Record<LogEntry["phase"], string> = {
  system:  "text-zinc-400",
  clone:   "text-blue-300",
  build:   "text-amber-300",
  runtime: "text-emerald-300",
};

export function LogStream({ deploymentId }: { deploymentId: string }) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    setLines([]);
    const es = new EventSource(`/api/deployments/${deploymentId}/logs`);
    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));
    es.addEventListener("log", (e) => {
      try {
        const entry = JSON.parse((e as MessageEvent).data) as LogEntry;
        setLines((prev) => {
          const next = prev.length > 5000 ? prev.slice(-4500) : prev;
          return [...next, entry];
        });
      } catch {
        // ignore malformed
      }
    });
    return () => es.close();
  }, [deploymentId]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 40;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-black">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span>logs</span>
        <span className={connected ? "text-emerald-400" : "text-zinc-500"}>
          {connected ? "● live" : "○ disconnected"}
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="font-mono text-xs leading-relaxed overflow-auto h-[60vh] p-3"
      >
        {lines.length === 0 ? (
          <div className="text-zinc-500">waiting for output…</div>
        ) : (
          lines.map((entry, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className={`${PHASE_COLOR[entry.phase]} mr-2`}>
                [{entry.phase}]
              </span>
              <span className="text-zinc-200">{entry.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
