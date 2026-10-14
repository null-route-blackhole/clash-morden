import assert from "node:assert/strict";

import { resolveIntlLocale } from "../src/utils/intl-locale";

const date = new Date("2026-10-10T10:00:00Z");
// Reproduce the overview's previous crash with the application's actual locale key.
assert.throws(() => date.toLocaleString("zh_CN"), RangeError);
for (const [input, expected] of [
  ["zh_CN", "zh-CN"],
  ["zhCN", "zh-CN"],
  ["zhcN", "zh-CN"],
  ["zh-TW", "zh-TW"],
  ["zh_Hant_TW", "zh-Hant-TW"],
  ["en", "en"],
  ["ru", "ru"],
  ["fa", "fa"],
  ["enUS", "en-US"],
  ["en-@", "en"],
  ["", "en"],
  [undefined, "en"],
] as const) {
  const locale = resolveIntlLocale(input);
  assert.equal(locale, expected);
  assert.doesNotThrow(() => date.toLocaleString(locale));
  assert.doesNotThrow(() =>
    new Intl.DisplayNames([locale], { type: "region" }).of("CN"),
  );
}
assert.equal(
  new Intl.DisplayNames([resolveIntlLocale("zh_CN")], { type: "region" }).of(
    "CN",
  ),
  "中国",
);
console.log("Intl locale regression checks passed.");
