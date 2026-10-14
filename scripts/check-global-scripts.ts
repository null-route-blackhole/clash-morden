import assert from "node:assert/strict";

import {
  globalScriptModuleSource,
  GlobalScriptRuntime,
} from "../src/services/global-script-runtime";
import type {
  GlobalScript,
  ScriptStatus,
} from "../src/stores/globalScriptsStore";

const styles = new Set<unknown>();
const values = new Map<string, string>();
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    createElement: () => ({
      textContent: "",
      dataset: {},
      remove() {
        styles.delete(this);
      },
    }),
    head: { append: (style: unknown) => styles.add(style) },
  },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
});
const script = (id: string, code: string): GlobalScript => ({
  id,
  name: id,
  description: "",
  enabled: true,
  code,
});
const load = async (code: string) =>
  import(
    `data:text/javascript;base64,${Buffer.from(globalScriptModuleSource(code)).toString("base64")}`
  );
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const logs: { id: string; level: string; message: string }[] = [];
const states = new Map<string, ScriptStatus>();
const runtime = new GlobalScriptRuntime({
  load,
  log: (id, level, message) => logs.push({ id, level, message }),
  status: (id, status) => states.set(id, status),
});

const first = script(
  "first",
  `GM_addStyle("body { color: red; }"); GM_setValue("key", 1); onRouteChange(path => console.log(path)); onCleanup(() => console.log("cleanup"));`,
);
const second = script("second", `console.log(GM_getValue("key", "isolated"));`);
runtime.routeChanged("/profiles");
runtime.reconcile([first, second]);
await tick();
assert.equal(styles.size, 1);
assert.equal(states.get("first")?.state, "running");
assert(logs.some((log) => log.id === "first" && log.message === "/profiles"));
assert(logs.some((log) => log.id === "second" && log.message === "isolated"));
assert.equal(values.get("global-script-value:first:key"), "1");
runtime.routeChanged("/proxies");
assert(logs.some((log) => log.id === "first" && log.message === "/proxies"));
runtime.reconcile([first, second]);
await tick();
assert.equal(styles.size, 1, "unchanged scripts must not run twice");
runtime.reconcile([{ ...first, enabled: false }, second]);
assert.equal(styles.size, 0, "disabling must remove injected styles");
assert.equal(states.get("first")?.state, "stopped");
const before = logs.length;
runtime.routeChanged("/settings");
assert.equal(logs.length, before, "disabled route callbacks must be removed");

const bad = script(
  "bad",
  `GM_addStyle("bad {}"); throw new Error("isolated failure");`,
);
runtime.reconcile([first, second, bad]);
await tick();
assert.equal(states.get("bad")?.state, "error");
assert.equal(states.get("second")?.state, "running");
assert.equal(
  styles.size,
  1,
  "failed scripts must clean up their own resources",
);
const failures = logs.filter((log) => log.id === "bad").length;
runtime.reconcile([first, second, bad]);
await tick();
assert.equal(
  logs.filter((log) => log.id === "bad").length,
  failures,
  "failed revisions must not loop",
);
await assert.rejects(load("const = invalid;"), SyntaxError);
runtime.reconcile([
  { ...first, code: 'GM_addStyle("body { color: blue; }");' },
  second,
]);
await tick();
assert.equal(styles.size, 1, "editing must replace old resources");
runtime.dispose();
assert.equal(styles.size, 0);

let release: (() => void) | undefined;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});
let lateCleanup = 0;
const pending = new GlobalScriptRuntime({
  log: () => {},
  status: () => {},
  load: async () => ({
    default: async (context) => {
      await gate;
      context.GM_addStyle("late {}");
      return () => {
        lateCleanup++;
      };
    },
  }),
});
pending.reconcile([script("late", "")]);
await tick();
pending.dispose();
release!();
await tick();
assert.equal(
  styles.size,
  0,
  "late async completion must not restore stopped styles",
);
assert.equal(lateCleanup, 1, "cleanup returned after stopping must still run");
console.log(
  "Global scripts: compilation, execution, routing, storage isolation, cleanup, revision replacement and async cancellation passed.",
);
