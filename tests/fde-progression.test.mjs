import assert from "node:assert/strict";
import {
  ADVANCE_SCORE,
  MODULE_FLOOR,
  PASS_SCORE,
  levelOrder,
} from "../assessment-levels.js";
import { buildExam, getQuestionBank, scoreQuestion } from "../exam-scoring.js";
import {
  PROGRESSION_KEY,
  canAccessLevel,
  clearProgression,
  createEmptyProgression,
  evaluateQualification,
  loadProgression,
  nextLevel,
  saveProgression,
  updateProgression,
} from "../exam-progression.js";

assert.equal(PASS_SCORE, 70);
assert.equal(ADVANCE_SCORE, 85);
assert.equal(MODULE_FLOOR, 70);
assert.deepEqual(levelOrder, ["junior", "intermediate", "advanced"]);

const multipleQuestion = { type: "multiple", answer: [0, 2, 3] };
assert.equal(scoreQuestion(multipleQuestion, [0, 2, 3]), 1);
assert.equal(scoreQuestion(multipleQuestion, [0, 2]), 0, "multi-select under-selection must score zero");
assert.equal(scoreQuestion(multipleQuestion, [0, 2, 3, 4]), 0, "multi-select over-selection must score zero");
assert.equal(scoreQuestion(multipleQuestion, [0, 1, 2]), 0, "multi-select wrong option must score zero");

const bankIds = getQuestionBank("junior").map((question) => question.id);
const fullIds = buildExam("junior", "full", () => 0).map((question) => question.id);
assert.equal(fullIds.length, bankIds.length);
assert.notDeepEqual(fullIds, bankIds, "new full attempts must shuffle the bank");
assert.deepEqual([...fullIds].sort(), [...bankIds].sort(), "shuffle must preserve every question");

const passing = {
  score: 88,
  unanswered: 0,
  moduleScores: { alpha: 90, beta: 72 },
  criticalMisses: 0,
};
assert.deepEqual(evaluateQualification("mock", passing), {
  qualifies: false,
  reason: "mode",
  lowestModuleScore: 72,
});
assert.equal(evaluateQualification("full", { ...passing, unanswered: 1 }).reason, "incomplete");
assert.equal(evaluateQualification("full", { ...passing, score: 84 }).reason, "score");
assert.equal(evaluateQualification("full", { ...passing, moduleScores: { alpha: 95, beta: 69 } }).reason, "module");
assert.equal(evaluateQualification("full", { ...passing, criticalMisses: 1 }).reason, "critical");
assert.deepEqual(evaluateQualification("full", passing), {
  qualifies: true,
  reason: "qualified",
  lowestModuleScore: 72,
});

const empty = createEmptyProgression();
assert.deepEqual(empty, { version: 2, records: {} });
assert.equal(canAccessLevel(empty, "junior"), true);
assert.equal(canAccessLevel(empty, "intermediate"), false);
assert.equal(canAccessLevel(empty, "advanced"), false);
assert.equal(nextLevel("junior"), "intermediate");
assert.equal(nextLevel("intermediate"), "advanced");
assert.equal(nextLevel("advanced"), null);

const mockUpdate = updateProgression(empty, "junior", "mock", passing, "2026-07-16T00:00:00.000Z");
assert.deepEqual(mockUpdate, empty, "mock results must not create progression evidence");

const juniorQualified = updateProgression(empty, "junior", "full", passing, "2026-07-16T00:00:00.000Z");
assert.equal(juniorQualified.records.junior.qualifies, true);
assert.equal(juniorQualified.records.junior.score, 88);
assert.equal(juniorQualified.records.junior.criticalMisses, 0);
assert.equal(canAccessLevel(juniorQualified, "intermediate"), true);
assert.equal(canAccessLevel(juniorQualified, "advanced"), false);

const weakerRetry = updateProgression(
  juniorQualified,
  "junior",
  "full",
  { score: 92, unanswered: 0, moduleScores: { alpha: 99, beta: 65 }, criticalMisses: 0 },
  "2026-07-17T00:00:00.000Z",
);
assert.deepEqual(weakerRetry, juniorQualified, "a non-qualifying retry must not replace qualifying evidence");

const betterRetry = updateProgression(
  juniorQualified,
  "junior",
  "full",
  { score: 91, unanswered: 0, moduleScores: { alpha: 93, beta: 75 }, criticalMisses: 0 },
  "2026-07-18T00:00:00.000Z",
);
assert.equal(betterRetry.records.junior.score, 91);
assert.equal(betterRetry.records.junior.lowestModuleScore, 75);

const allQualified = updateProgression(
  betterRetry,
  "intermediate",
  "full",
  { score: 90, unanswered: 0, moduleScores: { alpha: 92, beta: 74 }, criticalMisses: 0 },
  "2026-07-19T00:00:00.000Z",
);
assert.equal(canAccessLevel(allQualified, "advanced"), true);

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const storage = new MemoryStorage();
assert.equal(saveProgression(storage, allQualified), true);
assert.ok(storage.getItem(PROGRESSION_KEY));
assert.deepEqual(loadProgression(storage), { valid: true, state: allQualified });

storage.setItem(PROGRESSION_KEY, JSON.stringify({ version: 999, records: {} }));
assert.deepEqual(loadProgression(storage), { valid: false, reason: "version", state: empty });

storage.setItem(PROGRESSION_KEY, "not json");
assert.deepEqual(loadProgression(storage), { valid: false, reason: "parse", state: empty });
assert.equal(clearProgression(storage), true);
assert.deepEqual(loadProgression(storage), { valid: true, state: empty });

console.log("FDE progression checks passed");
