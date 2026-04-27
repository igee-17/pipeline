import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { config } from "./config.js";

const logsDir = path.join(config.dataDir, "logs");
fs.mkdirSync(logsDir, { recursive: true });

export type LogPhase = "system" | "clone" | "build" | "runtime";

export interface LogLine {
  ts: number;
  phase: LogPhase;
  line: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(0);
const writers = new Map<string, fs.WriteStream>();

function logPath(id: string) {
  return path.join(logsDir, `${id}.log`);
}

function getWriter(id: string): fs.WriteStream {
  let w = writers.get(id);
  if (!w) {
    w = fs.createWriteStream(logPath(id), { flags: "a" });
    writers.set(id, w);
  }
  return w;
}

export function appendLog(id: string, phase: LogPhase, line: string) {
  const entry: LogLine = { ts: Date.now(), phase, line };
  getWriter(id).write(JSON.stringify(entry) + "\n");
  bus.emit(`log:${id}`, entry);
}

export function streamLogs(
  id: string,
  onLine: (entry: LogLine) => void,
): () => void {
  const file = logPath(id);
  if (fs.existsSync(file)) {
    const data = fs.readFileSync(file, "utf8");
    for (const raw of data.split("\n")) {
      if (!raw) continue;
      try {
        onLine(JSON.parse(raw));
      } catch {
        // skip malformed line
      }
    }
  }

  const handler = (entry: LogLine) => onLine(entry);
  bus.on(`log:${id}`, handler);

  return () => {
    bus.off(`log:${id}`, handler);
  };
}

export function closeLog(id: string) {
  const w = writers.get(id);
  if (w) {
    w.end();
    writers.delete(id);
  }
}
