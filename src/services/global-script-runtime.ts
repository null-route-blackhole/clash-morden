import type {
  GlobalScript,
  ScriptLog,
  ScriptStatus,
} from "@/stores/globalScriptsStore";

export interface ScriptContext {
  console: Pick<Console, "log" | "info" | "warn" | "error">;
  GM_addStyle: (css: string) => HTMLStyleElement;
  GM_getValue: <T>(key: string, fallback?: T) => T | undefined;
  GM_setValue: (key: string, value: unknown) => void;
  onCleanup: (callback: () => void) => void;
  onRouteChange: (callback: (pathname: string) => void) => void;
  signal: AbortSignal;
}
type ScriptModule = { default: (context: ScriptContext) => unknown };
export const globalScriptModuleSource = (code: string) =>
  `export default async function({ console, GM_addStyle, GM_getValue, GM_setValue, onCleanup, onRouteChange, signal }) {\n${code}\n}`;

/** Compiles the script body without executing it; CSP allows only local modules. */
export const loadGlobalScriptModule = async (
  code: string,
): Promise<ScriptModule> => {
  const url = URL.createObjectURL(
    new Blob([globalScriptModuleSource(code)], { type: "text/javascript" }),
  );
  try {
    return (await import(/* @vite-ignore */ url)) as ScriptModule;
  } finally {
    URL.revokeObjectURL(url);
  }
};
interface Instance {
  code: string;
  controller: AbortController;
  cleanup: Set<() => void>;
  routes: Set<(pathname: string) => void>;
}
interface RuntimeOptions {
  log: (id: string, level: ScriptLog["level"], message: string) => void;
  status: (id: string, status: ScriptStatus) => void;
  load?: typeof loadGlobalScriptModule;
}
const describe = (value: unknown): string => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export class GlobalScriptRuntime {
  private instances = new Map<string, Instance>();
  private pathname =
    typeof window === "undefined" ? "/" : window.location.pathname;
  constructor(private options: RuntimeOptions) {}
  private stop(id: string) {
    const instance = this.instances.get(id);
    if (!instance) return;
    this.instances.delete(id);
    instance.controller.abort();
    for (const cleanup of [...instance.cleanup].reverse()) {
      try {
        cleanup();
      } catch (error) {
        this.options.log(id, "error", describe(error));
      }
    }
    instance.routes.clear();
    instance.cleanup.clear();
    this.options.status(id, { state: "stopped" });
  }
  reconcile(scripts: GlobalScript[]) {
    const enabled = new Map(
      scripts
        .filter((script) => script.enabled)
        .map((script) => [script.id, script]),
    );
    for (const [id, instance] of this.instances) {
      if (!enabled.has(id) || enabled.get(id)!.code !== instance.code)
        this.stop(id);
    }
    for (const script of enabled.values())
      if (!this.instances.has(script.id)) void this.start(script);
  }
  private async start(script: GlobalScript) {
    const instance: Instance = {
      code: script.code,
      controller: new AbortController(),
      cleanup: new Set(),
      routes: new Set(),
    };
    this.instances.set(script.id, instance);
    const alive = () =>
      this.instances.get(script.id) === instance &&
      !instance.controller.signal.aborted;
    const log = (level: ScriptLog["level"], ...values: unknown[]) => {
      if (alive())
        this.options.log(script.id, level, values.map(describe).join(" "));
    };
    const context: ScriptContext = {
      console: {
        log: (...args) => log("log", ...args),
        info: (...args) => log("info", ...args),
        warn: (...args) => log("warn", ...args),
        error: (...args) => log("error", ...args),
      },
      signal: instance.controller.signal,
      onCleanup: (callback) => {
        if (alive()) instance.cleanup.add(callback);
        else callback();
      },
      onRouteChange: (callback) => {
        if (alive()) {
          instance.routes.add(callback);
          callback(this.pathname);
        }
      },
      GM_addStyle: (css) => {
        const style = document.createElement("style");
        style.textContent = css;
        style.dataset.globalScript = script.id;
        if (alive()) {
          document.head.append(style);
          instance.cleanup.add(() => style.remove());
        }
        return style;
      },
      GM_getValue: <T>(key: string, fallback?: T) => {
        const value = localStorage.getItem(
          `global-script-value:${script.id}:${key}`,
        );
        if (value === null) return fallback;
        try {
          return JSON.parse(value) as T;
        } catch {
          return fallback;
        }
      },
      GM_setValue: (key, value) => {
        if (alive())
          localStorage.setItem(
            `global-script-value:${script.id}:${key}`,
            JSON.stringify(value),
          );
      },
    };
    try {
      const module = await (this.options.load ?? loadGlobalScriptModule)(
        script.code,
      );
      if (!alive()) return;
      this.options.status(script.id, { state: "running" });
      const cleanup = await module.default(context);
      if (typeof cleanup === "function")
        context.onCleanup(cleanup as () => void);
    } catch (error) {
      if (!alive()) return;
      log("error", error);
      this.stop(script.id);
      // Retain the failed revision until explicitly toggled or edited.
      this.instances.set(script.id, instance);
      this.options.status(script.id, {
        state: "error",
        message: describe(error),
      });
    }
  }
  routeChanged(pathname: string) {
    this.pathname = pathname;
    for (const [id, instance] of this.instances)
      for (const callback of instance.routes) {
        try {
          callback(pathname);
        } catch (error) {
          this.options.log(id, "error", describe(error));
        }
      }
  }
  dispose() {
    for (const id of [...this.instances.keys()]) this.stop(id);
  }
}
