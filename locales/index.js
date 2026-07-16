import { enUS } from "./en-US.js";
import { zhCN } from "./zh-CN.js";

export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"]);

export function normalizeLocale(value) {
  return String(value ?? "").toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
}

export function bundleFor(locale) {
  return normalizeLocale(locale) === "en-US" ? enUS : zhCN;
}

export const activeLocale = normalizeLocale(globalThis.document?.documentElement?.lang);
export const activeBundle = bundleFor(activeLocale);
