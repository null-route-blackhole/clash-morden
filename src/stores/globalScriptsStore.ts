import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GlobalScript {
  id: string;
  name: string;
  description: string;
  code: string;
  enabled: boolean;
  url?: string;
  updated?: number;
  option?: IProfileOption;
}
export interface ScriptLog {
  time: number;
  level: "log" | "info" | "warn" | "error";
  message: string;
}
export interface ScriptStatus {
  state: "running" | "error" | "stopped";
  message?: string;
}
interface GlobalScriptsState {
  scripts: GlobalScript[];
  logs: Record<string, ScriptLog[]>;
  statuses: Record<string, ScriptStatus>;
  save: (script: Omit<GlobalScript, "id"> & { id?: string }) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  log: (id: string, level: ScriptLog["level"], message: string) => void;
  setStatus: (id: string, status: ScriptStatus) => void;
  clearLogs: (id: string) => void;
}
export const useGlobalScriptsStore = create<GlobalScriptsState>()(
  persist(
    (set) => ({
      scripts: [],
      logs: {},
      statuses: {},
      save: (script) =>
        set((state) => {
          const item = { ...script, id: script.id ?? nanoid() };
          return {
            scripts: state.scripts.some((s) => s.id === item.id)
              ? state.scripts.map((s) => (s.id === item.id ? item : s))
              : [...state.scripts, item],
          };
        }),
      toggle: (id) =>
        set((state) => ({
          scripts: state.scripts.map((script) =>
            script.id === id ? { ...script, enabled: !script.enabled } : script,
          ),
        })),
      remove: (id) =>
        set((state) => ({
          scripts: state.scripts.filter((script) => script.id !== id),
          logs: Object.fromEntries(
            Object.entries(state.logs).filter(([key]) => key !== id),
          ),
          statuses: Object.fromEntries(
            Object.entries(state.statuses).filter(([key]) => key !== id),
          ),
        })),
      log: (id, level, message) =>
        set((state) =>
          state.scripts.some((script) => script.id === id)
            ? {
                logs: {
                  ...state.logs,
                  [id]: [
                    ...(state.logs[id] ?? []),
                    { time: Date.now(), level, message },
                  ].slice(-100),
                },
              }
            : state,
        ),
      setStatus: (id, status) =>
        set((state) =>
          state.scripts.some((script) => script.id === id)
            ? { statuses: { ...state.statuses, [id]: status } }
            : state,
        ),
      clearLogs: (id) =>
        set((state) => ({ logs: { ...state.logs, [id]: [] } })),
    }),
    {
      name: "global-page-scripts-v1",
      partialize: (state) => ({ scripts: state.scripts }),
      merge: (persisted, current) => {
        const scripts = (persisted as { scripts?: unknown })?.scripts;
        return {
          ...current,
          scripts: Array.isArray(scripts)
            ? scripts.filter(
                (script): script is GlobalScript =>
                  script &&
                  typeof script.id === "string" &&
                  typeof script.name === "string" &&
                  typeof script.description === "string" &&
                  typeof script.code === "string" &&
                  typeof script.enabled === "boolean",
              )
            : [],
        };
      },
    },
  ),
);
