import type { ConnectionInfo } from "tauri-plugin-mihomo-api";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

import { connectionDestinationIP } from "@/utils/connection-destination";

export const HISTORY_DIMENSIONS = [
  "nodes",
  "clients",
  "destIp",
  "hosts",
  "groups",
  "process",
  "countries",
] as const;
export type HistoryDimension = (typeof HISTORY_DIMENSIONS)[number];
export interface HistoryTotals {
  label: string;
  count: number;
  upload: number;
  download: number;
}
type Bucket = Partial<Record<HistoryDimension, Record<string, HistoryTotals>>>;
interface Seen {
  upload: number;
  download: number;
  touched: number;
}
export interface ConnectionHistory {
  buckets: Record<string, Bucket>;
  seen: Record<string, Seen>;
  startedAt: number;
  retentionDays: number;
}
const DAY = 86400000;
export const emptyConnectionHistory = (
  now = Date.now(),
): ConnectionHistory => ({
  buckets: {},
  seen: {},
  startedAt: now,
  retentionDays: 7,
});

export const accumulateConnectionHistory = (
  state: ConnectionHistory,
  connections: ConnectionInfo[],
  now = Date.now(),
): ConnectionHistory => {
  const day = String(Math.floor(now / DAY));
  const cutoff = state.retentionDays
    ? Math.floor(now / DAY) - state.retentionDays + 1
    : -Infinity;
  const buckets = Object.fromEntries(
    Object.entries(state.buckets).filter(([date]) => Number(date) >= cutoff),
  );
  const bucket: Bucket = {};
  for (const dimension of HISTORY_DIMENSIONS)
    bucket[dimension] = { ...buckets[day]?.[dimension] };
  const seen = { ...state.seen };
  const active = new Set<string>();
  for (const connection of connections) {
    const id = JSON.stringify([connection.id, connection.start]);
    active.add(id);
    const previous = seen[id];
    const reset =
      previous &&
      (connection.upload < previous.upload ||
        connection.download < previous.download);
    const upload = Math.max(
      0,
      connection.upload - (reset ? 0 : (previous?.upload ?? 0)),
    );
    const download = Math.max(
      0,
      connection.download - (reset ? 0 : (previous?.download ?? 0)),
    );
    const count = !previous || reset ? 1 : 0;
    seen[id] = {
      upload: connection.upload,
      download: connection.download,
      touched: now,
    };
    if (!count && !upload && !download) continue;
    const m = connection.metadata;
    const destinationIP = connectionDestinationIP(m);
    const labels: Record<HistoryDimension, string> = {
      nodes: connection.chains[0] || "DIRECT",
      clients: m.sourceIP || "Unknown",
      destIp: destinationIP || "Unknown",
      hosts: m.host || m.sniffHost || m.destinationIP || "Unknown",
      groups:
        connection.chains.length > 1 ? connection.chains.at(-1)! : "DIRECT",
      process:
        (m.process || m.processPath || "Unknown").split(/[\\/]/).pop() ||
        "Unknown",
      countries: destinationIP || "Unknown",
    };
    for (const dimension of HISTORY_DIMENSIONS) {
      const label = labels[dimension];
      const key = JSON.stringify(label);
      const old = bucket[dimension]![key];
      bucket[dimension]![key] = {
        label,
        count: (old?.count ?? 0) + count,
        upload: (old?.upload ?? 0) + upload,
        download: (old?.download ?? 0) + download,
      };
    }
  }
  // Keep a bounded deduplication tail; aggregates survive beyond this tail.
  const inactive = Object.keys(seen)
    .filter((id) => !active.has(id))
    .sort((a, b) => seen[b].touched - seen[a].touched);
  for (const id of inactive.slice(1000)) delete seen[id];
  buckets[day] = bucket;
  return { ...state, buckets, seen };
};

let pending: { key: string; value: string } | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const flush = () => {
  if (pending) {
    try {
      localStorage.setItem(pending.key, pending.value);
    } catch {
      /* Keep this session's statistics if storage is full. */
    }
    pending = undefined;
  }
  timer = undefined;
};
const storage: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    pending = { key, value };
    if (!timer) timer = setTimeout(flush, 2000);
  },
  removeItem: (key) => localStorage.removeItem(key),
};
if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

interface Actions {
  ingest: (connections: ConnectionInfo[]) => void;
  setRetentionDays: (days: number) => void;
  clear: () => void;
}
export const useConnectionHistoryStore = create<ConnectionHistory & Actions>()(
  persist(
    (set) => ({
      ...emptyConnectionHistory(),
      ingest: (connections) =>
        set((state) => accumulateConnectionHistory(state, connections)),
      setRetentionDays: (days) =>
        set((state) => ({
          ...accumulateConnectionHistory({ ...state, retentionDays: days }, []),
          seen: state.seen,
        })),
      clear: () => {
        set((state) => ({
          buckets: {},
          startedAt: Date.now(),
          seen: state.seen,
        }));
        if (timer) clearTimeout(timer);
        flush();
      },
    }),
    {
      name: "connection-history-v1",
      storage: createJSONStorage(() => storage),
      partialize: ({ buckets, seen, retentionDays, startedAt }) => ({
        buckets,
        seen,
        retentionDays,
        startedAt,
      }),
    },
  ),
);
