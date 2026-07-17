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
    en.questionBanks[level].map(({ id, type, module, answer, critical, options }) => ({
      id,
      type,
      module,
      answer,
      critical,
      optionCount: options.length,
    })),
    zh.questionBanks[level].map(({ id, type, module, answer, critical, options }) => ({
      id,
      type,
      module,
      answer,
      critical,
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

const englishQuestions = Object.values(en.questionBanks).flat();
const englishQuestionCopy = englishQuestions.flatMap((question) => [
  question.context,
  question.prompt,
  ...question.options,
  question.explanation,
]).join("\n");
const englishQuickCopy = en.quick.questions.flatMap((question) => [
  question.scenario,
  question.prompt,
  ...question.options.flatMap((option) => [option.text, option.signal]),
]).join("\n");
assert.doesNotMatch(`${englishQuickCopy}\n${englishQuestionCopy}`, /[\u3400-\u9fff]/u);
assert.doesNotMatch(`${englishQuickCopy}\n${englishQuestionCopy}`, /carry out landing|empowerment|closed loop thinking|calibration your ability/i);

for (const question of englishQuestions) {
  assert.ok(question.prompt.trim(), `${question.id} prompt must be translated`);
  assert.ok(question.explanation.trim(), `${question.id} explanation must be translated`);
  assert.ok(question.options.every((option) => option.trim()), `${question.id} options must be translated`);
}

console.log("FDE bilingual locale contract checks passed");
