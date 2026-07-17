import assert from "node:assert/strict";
import { levelDefinitions } from "../assessment-levels.js";
import { buildExam, classifyExamScore, scoreDiagnosticQuestion, scoreExam, scoreQuestion } from "../exam-scoring.js";
import { clearExamState, examStateKey, loadExamState, saveExamState } from "../exam-state.js";

assert.equal(scoreQuestion({ type: "single", answer: [1] }, [1]), 1);
assert.equal(scoreQuestion({ type: "single", answer: [1] }, [0]), 0);
assert.equal(scoreQuestion({ type: "multiple", answer: [0, 2] }, [0]), 0);
assert.equal(scoreQuestion({ type: "multiple", answer: [0, 2] }, [0, 2]), 1);
assert.equal(scoreDiagnosticQuestion({ type: "multiple", answer: [0, 2], options: ["a", "b", "c", "d"] }, [0]), 0.5);
assert.equal(scoreDiagnosticQuestion({ type: "multiple", answer: [0, 2], options: ["a", "b", "c", "d"] }, [0, 1]), 0);
assert.equal(scoreDiagnosticQuestion({ type: "multiple", answer: [0, 2], options: ["a", "b", "c", "d"] }, [0, 1, 2, 3]), 0);
assert.equal(scoreDiagnosticQuestion({ type: "single", answer: [1], options: ["a", "b"] }, [1]), 1);
assert.equal(classifyExamScore(69).status, "not-passed");
assert.equal(classifyExamScore(70).status, "passed");
assert.equal(classifyExamScore(84).status, "passed");
assert.equal(classifyExamScore(85).status, "excellent");

for (const [level, definition] of Object.entries(levelDefinitions)) {
  assert.equal(buildExam(level, "full", () => 0.25).length, definition.fullCount);
  const mock = buildExam(level, "mock", () => 0.25);
  assert.equal(mock.length, definition.mockCount);
  assert.equal(new Set(mock.map((question) => question.id)).size, mock.length);
  assert.deepEqual(
    definition.modules.map((module) => mock.filter((question) => question.module === module.id).length),
    definition.modules.map((module) => module.mockCount),
  );
}

const questions = [
  { id: "x1", type: "single", module: "m1", answer: [1], options: ["a", "b"] },
  { id: "x2", type: "multiple", module: "m1", answer: [0, 2], options: ["a", "b", "c"] },
  { id: "x3", type: "single", module: "m2", answer: [0], options: ["a", "b"] },
  { id: "x4", type: "single", module: "m2", answer: [0], options: ["a", "b"] },
];
const result = scoreExam(questions, { x1: [1], x2: [0], x3: [1] });
assert.equal(result.score, 25);
assert.equal(result.diagnosticScore, 38);
assert.equal(result.diagnosticEarned, 1.5);
assert.equal(result.correct, 1);
assert.equal(result.partial, 1);
assert.equal(result.incorrect, 1);
assert.equal(result.unanswered, 1);
assert.deepEqual(result.moduleScores, { m1: 50, m2: 0 });
assert.deepEqual(result.diagnosticModuleScores, { m1: 75, m2: 0 });
assert.equal(result.review.length, 3);

const criticalQuestion = {
  id: "c1",
  type: "single",
  module: "safety",
  critical: true,
  answer: [1],
  options: ["a", "b", "c", "d"],
};
const criticalResult = scoreExam([criticalQuestion], { c1: [0] });
assert.equal(criticalResult.criticalTotal, 1);
assert.equal(criticalResult.criticalCorrect, 0);
assert.equal(criticalResult.criticalMisses, 1);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const storage = new MemoryStorage();
const state = { level: "junior", mode: "full", questionIds: ["J001", "J002"], answers: { J001: [1] }, currentIndex: 1 };
const key = examStateKey("junior", "full");
assert.equal(saveExamState(storage, key, state), true);
assert.equal(loadExamState(storage, key, new Set(state.questionIds)).valid, true);
clearExamState(storage, key);
assert.equal(loadExamState(storage, key, new Set(state.questionIds)).reason, "missing");

console.log("FDE strict exam engine checks passed");
