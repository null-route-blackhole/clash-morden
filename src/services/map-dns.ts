import { invoke } from "@tauri-apps/api/core";
import ipaddr from "ipaddr.js";

const cache = new Map<string, { ip: string | null; expires: number }>();
const pending = new Map<string, Promise<string | null>>();
let active = 0;
const queue: (() => void)[] = [];

// Same DNS path as zashboard: Mihomo A, then AAAA; TTL cache and six workers.
export const resolveMapHost = (host: string): Promise<string | null> => {
  const name = host.trim().toLowerCase().replace(/\.$/, "");
  if (!name) return Promise.resolve(null);
  const cached = cache.get(name);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.ip);
  const existing = pending.get(name);
  if (existing) return existing;
  const task = (async () => {
    if (active >= 6) await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
    try {
      for (const [recordType, answerType] of [["A", 1], ["AAAA", 28]] as const) {
        try {
          const result = await invoke<{ Answer?: { type: number; data: string; TTL: number }[] }>(
            "query_map_dns", { name, recordType },
          );
          for (const answer of result.Answer ?? []) {
            if (answer.type !== answerType || !ipaddr.isValid(answer.data)) continue;
            const address = ipaddr.parse(answer.data);
            if (address.range() !== "unicast") continue;
            const ip = address.toNormalizedString();
            cache.set(name, { ip, expires: Date.now() + Math.max(1, answer.TTL || 60) * 1000 });
            return ip;
          }
        } catch { /* Try IPv6, then cache the failure briefly. */ }
      }
      cache.set(name, { ip: null, expires: Date.now() + 30_000 });
      return null;
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
      while (cache.size > 4096) cache.delete(cache.keys().next().value!);
    }
  })().finally(() => pending.delete(name));
  pending.set(name, task);
  return task;
};
