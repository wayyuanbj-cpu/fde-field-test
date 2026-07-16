import { zhCN } from "./zh-CN.js";

// The English bundle is populated with native editorial content in Task 2.
// Reusing the Chinese contract here lets the shared locale engine land first
// while parity tests protect every ID, answer key, and scoring field.
export const enUS = Object.freeze({
  ...zhCN,
  locale: "en-US",
  htmlLang: "en",
});
