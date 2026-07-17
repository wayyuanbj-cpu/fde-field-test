import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { levelDefinitions } from "../assessment-levels.js";
import { getQuestionBank } from "../exam-scoring.js";

const expected = { junior: 100, intermediate: 60, advanced: 40 };
for (const [level, count] of Object.entries(expected)) {
  const questions = getQuestionBank(level);
  assert.equal(questions.length, count, `${level} must keep its full question count`);
  assert.equal(levelDefinitions[level].fullCount, count);
  assert.equal(new Set(questions.map((question) => question.id)).size, count, `${level} question ids must be unique`);
  for (const question of questions) {
    assert.ok(["single", "multiple", "judgment"].includes(question.type));
    assert.ok(Array.isArray(question.options) && question.options.length >= 2);
    assert.ok(Array.isArray(question.answer) && question.answer.length >= 1);
    if (question.type === "multiple") assert.ok(question.answer.length >= 2, `${question.id} must have multiple correct answers`);
  }
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /NO LEVEL SKIPPING/);
assert.match(html, /严格分.*85.*每模块.*70.*关键题零错.*答题可信/s);
assert.match(html, /少选、多选、错选均不得分/);
assert.match(html, /不代表正式毕业、认证或真实项目能力结论/);
assert.match(html, /不上传、不写入浏览器、不进入统计后台/);
assert.match(html, /仅收集不含姓名和答案的匿名运行统计/);

console.log("FDE content and question-bank regression checks passed");
