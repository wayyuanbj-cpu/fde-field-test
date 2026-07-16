import assert from "node:assert/strict";
import { bundleFor, normalizeLocale } from "../locales/index.js";

const zh = bundleFor("zh-CN");
const en = bundleFor("en-US");
const expected = { quick: 12, junior: 100, intermediate: 60, advanced: 40 };

assert.equal(zh.quick.questions.length, expected.quick);
assert.equal(en.quick.questions.length, expected.quick);
assert.deepEqual(
  en.quick.questions.map(({ id, dimension, options }) => ({
    id,
    dimension,
    scores: options.map((option) => option.score),
    optionCount: options.length,
  })),
  zh.quick.questions.map(({ id, dimension, options }) => ({
    id,
    dimension,
    scores: options.map((option) => option.score),
    optionCount: options.length,
  })),
);

for (const level of ["junior", "intermediate", "advanced"]) {
  assert.equal(zh.questionBanks[level].length, expected[level]);
  assert.equal(en.questionBanks[level].length, expected[level]);
  assert.deepEqual(
    en.questionBanks[level].map(({ id, type, module, answer, options }) => ({
      id,
      type,
      module,
      answer,
      optionCount: options.length,
    })),
    zh.questionBanks[level].map(({ id, type, module, answer, options }) => ({
      id,
      type,
      module,
      answer,
      optionCount: options.length,
    })),
  );
}

assert.equal(normalizeLocale("en"), "en-US");
assert.equal(normalizeLocale("EN-gb"), "en-US");
assert.equal(normalizeLocale("zh-CN"), "zh-CN");
assert.equal(normalizeLocale("fr"), "zh-CN");
assert.equal(zh.locale, "zh-CN");
assert.equal(en.locale, "en-US");

console.log("FDE bilingual locale contract checks passed");
