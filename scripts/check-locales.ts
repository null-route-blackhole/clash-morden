import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 校验 4 语言扁平 locale JSON 的键集合完全一致（en 为基准）
const LOCALE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");
const LANGS = ["en", "zh_CN", "ru", "fa"];

const flattenKeys = (obj: unknown, prefix = ""): Set<string> => {
  const keys = new Set<string>();
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") {
        for (const sub of flattenKeys(value, path)) keys.add(sub);
      } else {
        keys.add(path);
      }
    }
  }
  return keys;
};

const load = (lang: string) =>
  JSON.parse(readFileSync(join(LOCALE_DIR, `${lang}.json`), "utf-8"));

const base = flattenKeys(load("en"));
let failed = false;

for (const lang of LANGS.slice(1)) {
  const keys = flattenKeys(load(lang));
  const missing = [...base].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !base.has(key));

  if (missing.length > 0 || extra.length > 0) {
    failed = true;
    console.error(`[${lang}] keys: ${keys.size} (base: ${base.size})`);
    if (missing.length > 0) {
      console.error(`  missing (${missing.length}):`);
      for (const key of missing.slice(0, 10)) console.error(`    - ${key}`);
      if (missing.length > 10) console.error(`    … ${missing.length - 10} more`);
    }
    if (extra.length > 0) {
      console.error(`  extra (${extra.length}):`);
      for (const key of extra.slice(0, 10)) console.error(`    + ${key}`);
      if (extra.length > 10) console.error(`    … ${extra.length - 10} more`);
    }
  } else {
    console.log(`[${lang}] ok (${keys.size} keys)`);
  }
}

if (failed) {
  console.error("Locale key sets are out of sync");
  process.exit(1);
}
console.log("All locale key sets match");
