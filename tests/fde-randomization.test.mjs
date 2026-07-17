import assert from "node:assert/strict";
import { prepareAttempt, restoreAttempt } from "../exam-randomization.js";

const source = {
  id: "Q1",
  type: "multiple",
  options: ["A source", "B source", "C source", "D source"],
  answer: [0, 2],
};

const restored = restoreAttempt([source], ["Q1"], { Q1: [2, 0, 3, 1] });
assert.deepEqual(restored[0].options, ["C source", "A source", "D source", "B source"]);
assert.deepEqual(restored[0].answer, [0, 1]);
assert.deepEqual(source.options, ["A source", "B source", "C source", "D source"], "source bank must not mutate");
assert.deepEqual(source.answer, [0, 2], "source answers must not mutate");

const prepared = prepareAttempt([source], () => 0);
assert.deepEqual(Object.keys(prepared.optionOrders), ["Q1"]);
assert.deepEqual([...prepared.optionOrders.Q1].sort((a, b) => a - b), [0, 1, 2, 3]);
assert.deepEqual(
  prepared.questions[0].answer.map((index) => prepared.questions[0].options[index]).sort(),
  ["A source", "C source"],
  "option randomization must preserve answer meaning",
);

assert.throws(() => restoreAttempt([source], ["Q1"], { Q1: [0, 0, 2, 3] }), /option order/i);
assert.throws(() => restoreAttempt([source], ["Q1"], {}), /option order/i);
assert.throws(() => restoreAttempt([source], ["missing"], { missing: [0, 1, 2, 3] }), /question/i);

console.log("FDE option randomization checks passed");
